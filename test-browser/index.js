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
	before(async function(){
		this.timeout(0)
		this.server=await runServer()
		await buildWithTestServer('src',dstDir,'cache',downloads,this.server.url)
	})
	after(async function(){
		await this.server.close()
	})
	beforeEach(async function(){
		this.server.clearNotes()
		this.browser=await puppeteer.launch(visible?{
			headless: false,
			slowMo: 300
		}:{})
		const page=await this.browser.newPage()
		this.openPage=async()=>{
			await page.goto(browserUrl)
			return page
		}
		this.waitForFetchButton=()=>page.waitForXPath(`//button[not(@disabled) and contains(.,"Fetch notes")]`)
		this.hasText=async(text)=>(await page.$x(`//*[contains(text(),"${text}")]`)).length
	})
	afterEach(async function(){
		await this.browser.close()
	})
	it("runs basic query",async function(){
		this.server.setNotes([{
			"text": "the-only-note-comment"
		}])
		const page=await this.openPage()
		const button=await this.waitForFetchButton()
		assert(!await this.hasText("the-only-note-comment"))
		await button.click()
		await page.waitForSelector('.notes tbody')
		assert(await this.hasText("the-only-note-comment"))
	})
	it("updates the note",async function(){
		this.server.setNotes([{
			"id": 101,
			"comments": [{
				"date": "2022-04-01",
				"text": "the-first-note-comment"
			}]
		}])
		const page=await this.openPage()
		const button=await this.waitForFetchButton()
		assert(!await this.hasText("the-first-note-comment"))
		assert(!await this.hasText("the-second-note-comment"))
		await button.click()
		await page.waitForSelector('.notes tbody')
		assert(await this.hasText("the-first-note-comment"))
		assert(!await this.hasText("the-second-note-comment"))
		this.server.setNotes([{
			"id": 101,
			"comments": [{
				"date": "2022-04-01",
				"text": "the-first-note-comment"
			},{
				"date": "2022-04-02",
				"text": "the-second-note-comment"
			}]
		}])
		const updateLink=await page.$(`.notes tbody a`)
		await updateLink.click()
		await page.waitForSelector('.notes tbody tr + tr')
		assert(await this.hasText("the-first-note-comment"))
		assert(await this.hasText("the-second-note-comment"))
	})
})

async function readJson(downloadsFilename) {
	return JSON.parse(
		await fs.readFile(downloadsFilename,'utf-8')
	)
}
