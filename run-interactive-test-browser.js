import * as fs from 'fs/promises'
import url from 'url'
import puppeteer from 'puppeteer'
import runServer from './tools/server.js'
import {buildWithTestServer} from './tools/build.js'

const downloads=await readJson('downloads.json')
const demoNotes=await readJson('demo-notes.json')
console.log(`running dummy osm server`)
const server=await runServer()
server.setNotes(demoNotes)
const dstDir='test-build/dist'
console.log(`bundling test build`)
await buildWithTestServer('src',dstDir,'cache',downloads,server.url)
console.log(`running puppeteer`)
{
	const browserUrl=`${url.pathToFileURL(`${dstDir}/index.html`)}`
	const browser=await puppeteer.launch({headless:false})
	const page=await browser.newPage()
	await page.goto(browserUrl)
	browser.on('disconnected',()=>{
		server.close()
	})
}

async function readJson(downloadsFilename) {
	return JSON.parse(
		await fs.readFile(downloadsFilename,'utf-8')
	)
}
