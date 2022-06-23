import * as fs from 'fs/promises'
import { rollup } from 'rollup'
import typescript from '@rollup/plugin-typescript'

// compile and bundle scripts to be tested
for (const testDirEntry of await fs.readdir('test',{withFileTypes:true})) {
	if (testDirEntry.isDirectory()) continue
	const filename=testDirEntry.name
	const match=filename.match(/^(.*)\.js$/)
	if (!match) continue
	const [,script]=match
	const bundle=await rollup({
		input: `src/${script}.ts`,
		plugins: [typescript()]
	})
	bundle.write({
		file: `test-build/${script}.js`,
	})
	bundle.close()
}
