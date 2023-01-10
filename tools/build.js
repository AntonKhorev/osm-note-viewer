import * as fs from 'fs/promises'
import * as https from 'https'
import { createHash } from 'crypto'
import { rollup } from 'rollup'
import typescript from '@rollup/plugin-typescript'
import virtual from '@rollup/plugin-virtual'

export default async function build(srcDir,dstDir,cacheDir,serverListConfig) {
	await cleanupDirectory(dstDir)
	if (cacheDir) {
		await fs.mkdir(cacheDir,{recursive:true})
	}
	await buildHtml(srcDir,dstDir,cacheDir)
	await buildCss(srcDir,dstDir)
	await buildJs(srcDir,dstDir,serverListConfig)
}

export async function buildTest(srcDir,testDir,dstDir) {
	await cleanupDirectory(dstDir)
	const input=[]
	for (const testDirEntry of await fs.readdir(testDir,{withFileTypes:true})) {
		if (testDirEntry.isDirectory()) continue
		const filename=testDirEntry.name
		const match=filename.match(/^(.*)\.js$/)
		if (!match) continue
		const [,script]=match
		input.push(`${srcDir}/${script}.ts`)
	}
	const bundle=await rollup({
		input,
		plugins: [typescript()]
	})
	bundle.write({
		dir: dstDir
	})
	bundle.close()
}

async function cleanupDirectory(dir) {
	await fs.mkdir(dir,{recursive:true})
	for (const filename of await fs.readdir('dist')) {
		await fs.rm(`${dir}/${filename}`,{recursive:true,force:true})
	}
}

async function buildHtml(srcDir,dstDir,cacheDir) {
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
	if (cacheDir) {
		htmlContents=await downloadCdnFiles(dstDir,cacheDir,htmlContents)
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
			[`${srcDir}/server-list-config`]: `export default `+JSON.stringify(serverListConfig)
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

async function downloadCdnFiles(dstDir,cacheDir,htmlContents) {
	const regexp=new RegExp(`<(link|script)([^>]*)>`,'g')
	const downloads=new Map()
	htmlContents.replace(regexp,(match,tag,attributesString)=>{
		const urlAttribute=tag=='link'?'href':'src'
		const url=readHtmlAttribute(attributesString,urlAttribute)
		if (url==null) return match
		const filename=getFilenameFromUrl(url)
		if (filename==null) return match
		const integrity=readHtmlAttribute(attributesString,'integrity')
		downloads.set(url,[filename,integrity])
		return match
	})
	const completeDownloads=new Map()
	for (const [url,[filename,integrity]] of downloads) {
		let hash,digest
		if (integrity) {
			let algorithm
			[algorithm,digest]=integrity.split('-')
			hash=createHash(algorithm)
		}
		const dstFilename=`${dstDir}/${filename}`
		const cacheFilename=`${cacheDir}/${filename}`
		try {
			await fs.access(cacheFilename)
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
			await fs.writeFile(cacheFilename,buffer)
		}
		await fs.copyFile(cacheFilename,dstFilename)
		completeDownloads.set(url,filename)
	}
	return htmlContents.replace(regexp,(match,tag,attributesString)=>{
		const urlAttribute=tag=='link'?'href':'src'
		const url=readHtmlAttribute(attributesString,urlAttribute)
		if (url==null) return match
		const filename=completeDownloads.get(url)
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

function getFilenameFromUrl(url) {
	try {
		const urlObject=new URL(url)
		if (urlObject.host!='unpkg.com') return
		return urlObject.pathname.split('/').pop()
	} catch {}
}
