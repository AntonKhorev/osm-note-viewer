import * as fs from 'fs/promises'
import * as path from 'path'
import * as https from 'https'
import { createHash } from 'crypto'
import { rollup } from 'rollup'
import typescript from '@rollup/plugin-typescript'
import virtual from '@rollup/plugin-virtual'

export default async function build(srcDir,dstDir,cacheDir,downloads,serverListConfig) {
	await cleanupDirectory(dstDir)
	if (cacheDir) {
		await fs.mkdir(cacheDir,{recursive:true})
	}
	if (downloads) {
		await downloadFiles(dstDir,cacheDir,downloads)
	}
	await buildHtml(srcDir,dstDir,downloads)
	await buildCss(srcDir,dstDir)
	await buildJs(srcDir,dstDir,serverListConfig)
}

export async function buildWithTestServer(srcDir,dstDir,cacheDir,downloads,serverUrl) {
	await build(srcDir,dstDir,cacheDir,downloads,[{
		web: serverUrl,
		tiles: `${serverUrl}{z}/{x}/{y}.png`,
		note: `Test server bundled on ${new Date().toISOString()}`
	}])
}

export async function buildTest(srcDir,testDir,dstDir) {
	await cleanupDirectory(dstDir)
	const input=[]
	const scanTestDirectory=async(subpath='')=>{
		for (const testDirEntry of await fs.readdir(`${testDir}${subpath}`,{withFileTypes:true})) {
			if (testDirEntry.isDirectory()) {
				await scanTestDirectory('/'+testDirEntry.name)
			} else {
				const filename=testDirEntry.name
				const match=filename.match(/^(.*)\.js$/)
				if (!match) continue
				const [,script]=match
				input.push(`${srcDir}${subpath}/${script}.ts`)
			}
		}
	}
	await scanTestDirectory()
	const bundle=await rollup({
		input,
		plugins: [typescript()]
	})
	bundle.write({
		preserveModules: true,
		preserveModulesRoot: srcDir,
		dir: dstDir
	})
	bundle.close()
}

async function downloadFiles(dstDir,cacheDir,downloads) {
	for (const [url,filename,integrity] of downloads) {
		const dstFilename=`${dstDir}/${filename}`
		const cacheFilename=`${cacheDir}/${filename}`
		await downloadFileToCache(url,cacheFilename,integrity)
		await fs.mkdir(path.dirname(dstFilename),{recursive:true})
		await fs.copyFile(cacheFilename,dstFilename)
	}
}

async function cleanupDirectory(dir) {
	await fs.mkdir(dir,{recursive:true})
	for (const filename of await fs.readdir(dir)) { // delete contents instead of the whole dir because live server doesn't like the dir disappearing
		await fs.rm(`${dir}/${filename}`,{recursive:true,force:true})
	}
}

async function buildHtml(srcDir,dstDir,downloads) {
	const [embeddedStyles,embeddedSymbols]=await getAllEmbeddedSvgs(srcDir)
	const embeddedSvgs=
		`<svg class="symbols">\n`+
		`<style>\n`+
		embeddedStyles+
		`</style>\n`+
		embeddedSymbols+
		`</svg>`
	const favicon=await fs.readFile(`${srcDir}/svg/favicon.svg`,'utf-8')
	const encodedFavicon=Buffer.from(favicon).toString('base64')
	let htmlContents=await fs.readFile(`${srcDir}/index.html`,'utf-8')
	if (downloads) {
		htmlContents=await replaceHtmlLinksToDownloads(downloads,htmlContents)
	}
	htmlContents=htmlContents
		.replace(`<body>`,`<body data-build="${new Date().toISOString()}">`)
		.replace(`<!-- {embed svgs} -->`,embeddedSvgs)
		.replace(`<!-- {embed favicon} -->`,`<link rel=icon href="data:image/svg+xml;charset=utf-8;base64,${encodedFavicon}">`)
	await fs.writeFile(`${dstDir}/index.html`,htmlContents)
}

async function buildCss(srcDir,dstDir) {
	const cssFiles={}
	for (const dirEntry of await fs.readdir(`${srcDir}/css`,{withFileTypes:true})) {
		if (dirEntry.isDirectory()) continue
		const filename=dirEntry.name
		cssFiles[`css/${filename}`]=await fs.readFile(`${srcDir}/css/${filename}`,'utf-8')
	}
	const indexCss=await fs.readFile(`${srcDir}/index.css`,'utf-8')
	const bundledIndexCss=indexCss.replace(new RegExp(`@import '([^']*)';`,'g'),(_,filename)=>{
		const contents=cssFiles[filename]
		if (contents==null) return `// can't find file ${filename}\n`
		return `/*** ${filename} ***/\n${contents}`
	})
	await fs.writeFile(`${dstDir}/index.css`,bundledIndexCss)
}

async function buildJs(srcDir,dstDir,serverListConfig) {
	const plugins=[typescript()]
	if (serverListConfig) {
		plugins.unshift(virtual({
			[`${srcDir}/server-list-config`]: `export default `+JSON.stringify(serverListConfig,undefined,4)
		}))
	}
	const bundle=await rollup({
		input: `${srcDir}/index.ts`,
		plugins
	})
	bundle.write({
		file: `${dstDir}/index.js`,
	})
	bundle.close()
}

async function getAllEmbeddedSvgs(srcDir) {
	let styles=''
	let symbols=''
	for (const dirEntry of await fs.readdir(`${srcDir}/svg`,{withFileTypes:true})) {
		if (dirEntry.isDirectory()) continue
		const filename=dirEntry.name
		if (filename=='favicon.svg') continue
		const [style,symbol]=getEmbeddedSvg(
			filename.split('.')[0],
			await fs.readFile(`${srcDir}/svg/${filename}`,'utf-8')
		)
		styles+=style
		symbols+=symbol
	}
	return [styles,symbols]
}

function getEmbeddedSvg(id,input) {
	let style=''
	let symbol=''
	for (const line of input.split(/\r?\n/)) {
		let match
		if (match=line.match(/^<svg.*(viewBox="[^"]*").*>$/)) {
			const [,viewBox]=match
			symbol+=`<symbol id="${id}" ${viewBox}>\n`
		} else if (match=line.match(/^<\/svg>$/)) {
			symbol+=`</symbol>\n`
			break
		} else if (match=line.match(/^<g class="([^"]*)">$/)) {
			const [,partClass]=match
			const visibility=(partClass=='default'?'visible':'hidden')
			style+=`#${id} .${partClass} { visibility: var(--${id}-${partClass}-part-visibility,${visibility}); }\n`
			symbol+=line+'\n'
		} else {
			symbol+=line+'\n'
		}
	}
	return [style,symbol]
}

async function replaceHtmlLinksToDownloads(downloads,htmlContents) {
	const downloadFilenames=new Map(downloads)
	const htmlTagRegExp=new RegExp(`<(link|script)([^>]*)>`,'g')
	return htmlContents.replace(htmlTagRegExp,(match,tag,attributesString)=>{
		const urlAttribute=tag=='link'?'href':'src'
		const url=readHtmlAttribute(attributesString,urlAttribute)
		const filename=downloadFilenames.get(url)
		if (filename==null) return match
		const updatedAttributesString=replaceHtmlAttribute(
			['integrity','crossorigin'].reduce(removeHtmlAttribute,attributesString),
			urlAttribute,filename
		)
		return `<${tag}${updatedAttributesString}>`
	})
}

function readHtmlAttribute(attributesString,attribute) {
	const match=attributesString.match(new RegExp(`${attribute}="([^"]*)"`))
	if (match) {
		const [,value]=match
		return value
	}
}

function replaceHtmlAttribute(attributesString,attribute,value) {
	return attributesString.replace(new RegExp(`${attribute}="([^"]*)"`),`${attribute}="${value}"`)
}

function removeHtmlAttribute(attributesString,attribute) {
	return attributesString.replace(new RegExp(`\\s*${attribute}="([^"]*)"`),``)
}

async function downloadFileToCache(url,filename,integrity) {
	let hash,digest
	if (integrity) {
		let algorithm
		[algorithm,digest]=integrity.split('-')
		hash=createHash(algorithm)
	}
	try {
		await fs.access(filename)
	} catch {
		process.stdout.write(`downloading ${url} `)
		const buffer=await new Promise((resolve,reject)=>{
			https.get(url,response=>{
				if (response.statusCode!==200) return reject(`download of ${filename} failed with status code ${response.statusCode}`)
				const chunks=[]
				response.on('data',chunk=>{
					process.stdout.write(`.`)
					if (hash) hash.update(chunk)
					chunks.push(chunk)
				})
				response.on('error',err=>reject(`download of ${filename} failed while streaming with error ${err}`))
				response.on('end',()=>{
					if (hash && hash.digest('base64')!=digest) reject(`download of ${filename} failed integrity check`)
					resolve(Buffer.concat(chunks))
				})
			})
		})
		process.stdout.write(`done\n`)
		await fs.mkdir(path.dirname(filename),{recursive:true})
		await fs.writeFile(filename,buffer)
	}
}
