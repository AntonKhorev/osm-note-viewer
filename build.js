import fs from 'fs-extra'
import { rollup } from 'rollup'
import typescript from '@rollup/plugin-typescript'

// copy files
await fs.remove('dist')
await fs.copy('src/index.html','dist/index.html')
await fs.copy('src/index.css','dist/index.css')
for (const name of [
	'icon','icon-open','icon-closed',
	'flip-ver','flip-hor','reset',
	'crosshair'
]) {
	await fs.copy(`src/${name}.svg`,`dist/${name}.svg`)
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
