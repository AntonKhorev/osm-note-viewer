import * as fs from 'fs/promises'
import build from './tools/build.js'

const servers=await readJson('servers.json')
await build('src','dist',undefined,undefined,servers)

async function readJson(downloadsFilename) {
	return JSON.parse(
		await fs.readFile(downloadsFilename,'utf-8')
	)
}
