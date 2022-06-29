import * as fs from 'fs/promises'
import { rollup } from 'rollup'
import typescript from '@rollup/plugin-typescript'

// compile and bundle scripts to be tested
const input=[]
for (const testDirEntry of await fs.readdir('test',{withFileTypes:true})) {
	if (testDirEntry.isDirectory()) continue
	const filename=testDirEntry.name
	const match=filename.match(/^(.*)\.js$/)
	if (!match) continue
	const [,script]=match
	input.push(`src/${script}.ts`)
}
const bundle=await rollup({
	input,
	plugins: [typescript()]
})
bundle.write({
	dir: `test-build`
})
bundle.close()
