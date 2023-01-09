import * as fs from 'fs/promises'
import { rollup } from 'rollup'
import typescript from '@rollup/plugin-typescript'

export default async function build(srcDir,dstDir) {
	await cleanup(srcDir,dstDir)
	await buildHtml(srcDir,dstDir)
	await buildCss(srcDir,dstDir)
	await buildJs(srcDir,dstDir)
}

async function cleanup(srcDir,dstDir) {
	await fs.rm(dstDir,{recursive:true,force:true})
	await fs.mkdir(dstDir)
}

async function buildHtml(srcDir,dstDir) {
	// process svgs
	let embeddedStyles=''
	let embeddedSymbols=''
	for (const dirEntry of await fs.readdir(`${srcDir}/svg`,{withFileTypes:true})) {
		if (dirEntry.isDirectory()) continue
		const filename=dirEntry.name
		if (filename=='favicon.svg') continue
		const [style,symbol]=getEmbeddedSvg(
			filename.split('.')[0],
			await fs.readFile(`${srcDir}/svg/${filename}`,'utf-8')
		)
		embeddedStyles+=style
		embeddedSymbols+=symbol
	}

	// build index with embedded svgs
	const embeddedSvgs=
		`<svg class="symbols">\n`+
		`<style>\n`+
		embeddedStyles+
		`</style>\n`+
		embeddedSymbols+
		`</svg>`
	const favicon=await fs.readFile(`${srcDir}/svg/favicon.svg`,'utf-8')
	const encodedFavicon=Buffer.from(favicon).toString('base64')
	const htmlContents=await fs.readFile(`${srcDir}/index.html`,'utf-8')
	const patchedHtmlContents=htmlContents
		.replace(`<body>`,`<body data-build="${new Date().toISOString()}">`)
		.replace(`<!-- {embed svgs} -->`,embeddedSvgs)
		.replace(`<!-- {embed favicon} -->`,`<link rel=icon href="data:image/svg+xml;charset=utf-8;base64,${encodedFavicon}">`)
	await fs.writeFile(`${dstDir}/index.html`,patchedHtmlContents)
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

async function buildJs(srcDir,dstDir) {
	const bundle=await rollup({
		input: `${srcDir}/index.ts`,
		plugins: [typescript()]
	})
	bundle.write({
		file: `${dstDir}/index.js`,
	})
	bundle.close()
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
