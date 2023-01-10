import {strict as assert} from 'assert'
import * as fs from 'fs/promises'
import url from 'url'
import puppeteer from 'puppeteer'
import runServer from '../tools/server.js'
import {buildWithTestServer} from '../tools/build.js'

const downloads=await readJson('downloads.json')
const dstDir='test-build/dist'
const browserUrl=`${url.pathToFileURL(`${dstDir}/index.html`)}`

describe("browser tests",()=>{
	let server
	before(async function(){
		this.timeout(0)
		server=await runServer()
		await buildWithTestServer('src',dstDir,'cache',downloads,server.url)
	})
	after(async function(){
		await server.close()
	})
	// TODO beforeEach clear server data
	it("runs basic query",async()=>{
		// TODO setup server data
		const browser=await puppeteer.launch()
		const page=await browser.newPage()
		await page.goto(browserUrl)
		// TODO check that no results are displayed
		// TODO click fetch button
		// TODO check results
		browser.close()
	})
})

async function readJson(downloadsFilename) {
	return JSON.parse(
		await fs.readFile(downloadsFilename,'utf-8')
	)
}
