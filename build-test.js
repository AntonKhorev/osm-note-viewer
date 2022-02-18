import { rollup } from 'rollup'
import typescript from '@rollup/plugin-typescript'

// compile and bundle scripts to be tested
const bundle=await rollup({
	input: 'src/query.ts',
	plugins: [typescript()]
})
bundle.write({
	file: "test-build/query.js",
})
bundle.close()
