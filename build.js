import * as fs from 'fs/promises'
import build from './tools/build.js'

const servers=await readJson('servers.json')
await build(servers,'src','dist')

async function readJson(downloadsFilename) {
	return JSON.parse(
		await fs.readFile(downloadsFilename,'utf-8')
	)
}
