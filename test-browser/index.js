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
		this.assertText=async(text)=>assert(await this.hasText(text),`missing expected text "${text}"`)
		this.assertNoText=async(text)=>assert(!await this.hasText(text),`present unexpected text "${text}"`)
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
		await this.assertNoText("the-only-note-comment")
		await button.click()
		await page.waitForSelector('.notes tbody')
		await this.assertText("the-only-note-comment")
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
		await this.assertNoText("the-first-note-comment")
		await this.assertNoText("the-second-note-comment")
		await button.click()
		await page.waitForSelector('.notes tbody')
		await this.assertText("the-first-note-comment")
		await this.assertNoText("the-second-note-comment")
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
		await this.assertText("the-first-note-comment")
		await this.assertText("the-second-note-comment")
	})
})

async function readJson(downloadsFilename) {
	return JSON.parse(
		await fs.readFile(downloadsFilename,'utf-8')
	)
}
