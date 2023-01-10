import {strict as assert} from 'assert'
import * as fs from 'fs/promises'
import url from 'url'
import puppeteer from 'puppeteer'
import runServer from '../tools/server.js'
import {buildWithTestServer} from '../tools/build.js'

const visible=false

const downloads=await readJson('downloads.json')
const dstDir='test-build/dist'
const browserUrl=`${url.pathToFileURL(`${dstDir}/index.html`)}`

describe("browser tests",function(){
	if (visible) this.timeout(0)
	let server
	before(async function(){
		this.timeout(0)
		server=await runServer()
		await buildWithTestServer('src',dstDir,'cache',downloads,server.url)
	})
	after(async function(){
		await server.close()
	})
	beforeEach(function(){
		server.clearNotes()
	})
	it("runs basic query",async()=>{
		server.setNotes([{
			"text": "the-only-note-comment"
		}])
		const browser=await puppeteer.launch(visible?{
			headless: false,
			slowMo: 300
		}:{})
		const page=await browser.newPage()
		const waitForFetchButton=()=>page.waitForXPath(`//button[not(@disabled) and contains(.,"Fetch notes")]`)
		const hasText=async(text)=>(await page.$x(`//*[contains(text(),"${text}")]`)).length
		await page.goto(browserUrl)
		const button=await waitForFetchButton()
		assert(!await hasText("the-only-note-comment"))
		await button.click()
		await page.waitForSelector(`.notes tbody`)
		assert(await hasText("the-only-note-comment"))
		browser.close()
	})
})

async function readJson(downloadsFilename) {
	return JSON.parse(
		await fs.readFile(downloadsFilename,'utf-8')
	)
}
