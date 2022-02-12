import fs from 'fs-extra'
import { rollup } from 'rollup'
import typescript from '@rollup/plugin-typescript'

// copy files
await fs.remove('dist')
await fs.copy('src/index.html','dist/index.html')
await fs.copy('src/index.css','dist/index.css')
await fs.copy('src/icon.svg','dist/icon.svg')
await fs.copy('src/icon-open.svg','dist/icon-open.svg')
await fs.copy('src/icon-closed.svg','dist/icon-closed.svg')

// compile and bundle scripts
const bundle=await rollup({
	input: 'src/index.ts',
	plugins: [typescript()]
})
bundle.write({
	file: "dist/index.js",
})
bundle.close()
