import * as fs from 'fs/promises'
import build, {checkServerConfig} from './tools/build.js'

const servers=await readJson('servers.json')
try {
	await checkServerConfig(servers,'src')
} catch (ex) {
	console.log(`Error in servers.json: ${ex.message}`)
	process.exit(-1)
}
await build(servers,'src','dist')

async function readJson(downloadsFilename) {
	return JSON.parse(
		await fs.readFile(downloadsFilename,'utf-8')
	)
}
