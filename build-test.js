import { rollup } from 'rollup'
import typescript from '@rollup/plugin-typescript'

// compile and bundle scripts to be tested
for (const script of ['data','query','query-user','filter']) {
	const bundle=await rollup({
		input: `src/${script}.ts`,
		plugins: [typescript()]
	})
	bundle.write({
		file: `test-build/${script}.js`,
	})
	bundle.close()
}
