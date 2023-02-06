import * as fs from 'fs/promises'
import url from 'url'
import puppeteer from 'puppeteer'
import runOsmServer from './tools/osm-server.js'
import runClientServer from './tools/client-server.js'
import build from './tools/build.js'

const dstDir='test-build/dist'
let clientServer,clientUrl
if (process.argv.includes('--client-server')) {
	console.log(`running client server`)
	clientServer=await runClientServer(dstDir)
	clientUrl=clientServer.url
} else {
	clientUrl=`${url.pathToFileURL(`${dstDir}/index.html`)}`
}

console.log(`running dummy osm server`)
const downloads=await readJson('downloads.json')
const demoNotes=await readJson('demo-notes.json')
const osmServer=await runOsmServer(clientUrl)
osmServer.setNotes(demoNotes)
osmServer.setLogin(true)

console.log(`bundling test build`)
await build(osmServer.config,'src',dstDir,'cache',downloads)

console.log(`running puppeteer`)
{
	const browser=await puppeteer.launch({headless:false})
	const page=await browser.newPage()
	await page.goto(clientUrl)
	browser.on('disconnected',()=>{
		osmServer.close()
		if (clientServer) clientServer.close()
	})
}

async function readJson(downloadsFilename) {
	return JSON.parse(
		await fs.readFile(downloadsFilename,'utf-8')
	)
}
