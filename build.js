import fs from 'fs-extra'
import { rollup } from 'rollup'
import typescript from '@rollup/plugin-typescript'

// copy files
await fs.remove('dist')
await fs.copy('src/index.html','dist/index.html')
await fs.copy('src/index.css','dist/index.css')
for (const svgDirEntry of await fs.readdir('src/svg',{withFileTypes:true})) {
	if (svgDirEntry.isDirectory()) continue
	const filename=svgDirEntry.name
	await fs.copy(`src/svg/${filename}`,`dist/${filename}`)
}

// compile and bundle scripts
const bundle=await rollup({
	input: 'src/index.ts',
	plugins: [typescript()]
})
bundle.write({
	file: "dist/index.js",
})
bundle.close()
