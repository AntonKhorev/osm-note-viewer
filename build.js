import fs from 'fs-extra'
import { rollup } from 'rollup'
import typescript from '@rollup/plugin-typescript'

// remove previous build
await fs.remove('dist')

// process svgs
const embedSvgFiles=['tools-map.svg','tools-notes.svg']
let embeddedStyles=''
let embeddedSymbols=''
for (const svgDirEntry of await fs.readdir('src/svg',{withFileTypes:true})) {
	if (svgDirEntry.isDirectory()) continue
	const filename=svgDirEntry.name
	if (embedSvgFiles.includes(filename)) {
		const [style,symbol]=getEmbeddedSvg(
			filename.split('.')[0],
			await fs.readFile(`src/svg/${filename}`,'utf-8')
		)
		embeddedStyles+=style
		embeddedSymbols+=symbol
	} else {
		await fs.copy(`src/svg/${filename}`,`dist/${filename}`)
	}
}

// build index with embedded svgs
const embeddedSvgs=
	`<svg class="symbols">\n`+
	`<style>\n`+
	embeddedStyles+
	`</style>\n`+
	embeddedSymbols+
	`</svg>`
const htmlContents=await fs.readFile('src/index.html','utf-8')
const patchedHtmlContents=htmlContents.replace(`<!-- embed svgs -->`,embeddedSvgs)
await fs.writeFile('dist/index.html',patchedHtmlContents)

// copy css
await fs.copy('src/index.css','dist/index.css')

// compile and bundle scripts
const bundle=await rollup({
	input: 'src/index.ts',
	plugins: [typescript()]
})
bundle.write({
	file: "dist/index.js",
})
bundle.close()

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
			style+=`#${id} .${partClass} { visibility: var(--${id}-${partClass}-part-visibility,hidden); }\n`
			symbol+=line+'\n'
		} else {
			symbol+=line+'\n'
		}
	}
	return [style,symbol]
}
