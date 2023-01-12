import {strict as assert} from 'assert'
import * as fs from 'fs/promises'
import url from 'url'
import puppeteer from 'puppeteer'
import runServer from '../tools/server.js'
import {buildWithTestServer} from '../tools/build.js'

// const visible=true
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
			slowMo: 200
		}:{})
		const page=await this.browser.newPage()
		this.openPage=async()=>{
			await page.goto(browserUrl)
			return page
		}
		this.waitForFetchButton=()=>page.waitForXPath(`//button[not(@disabled) and contains(.,"Fetch notes")]`)
		this.waitForTool=(summaryText)=>page.waitForXPath(`//details[@class="tool" and contains(./summary,"${summaryText}")]`)
		const hasText=async(target,text)=>(await target.$x(`//*[contains(text(),"${text}")]`)).length
		this.assertText=async(target,text)=>assert(await hasText(target,text),`missing expected text "${text}"`)
		this.assertNoText=async(target,text)=>assert(!await hasText(target,text),`present unexpected text "${text}"`)
		this.assertAlternativeText=async(target,condition,text0,text1)=>{
			if (!condition) {
				assert( await hasText(target,text0),`missing expected text "${text0}"`)
				assert(!await hasText(target,text1),`present unexpected text "${text1}"`)
			} else {
				assert(!await hasText(target,text0),`present unexpected text "${text0}"`)
				assert( await hasText(target,text1),`missing expected text "${text1}"`)
			}
		}
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
		await this.assertNoText(page,"the-only-note-comment")
		await button.click()
		await page.waitForSelector('.notes tbody')
		await this.assertText(page,"the-only-note-comment")
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
		await this.assertNoText(page,"the-first-note-comment")
		await this.assertNoText(page,"the-second-note-comment")
		await button.click()
		await page.waitForSelector('.notes tbody')
		await this.assertText(page,"the-first-note-comment")
		await this.assertNoText(page,"the-second-note-comment")
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
		await this.assertText(page,"the-first-note-comment")
		await this.assertText(page,"the-second-note-comment")
	})
	it("halts/resumes note refreshes when clicking play button",async function(){
		const page=await this.openPage()
		const tool=await this.waitForTool(`Refresh notes`)
		await tool.click()
		const button=await tool.$('button')
		await this.assertAlternativeText(button,0,'Halt','Resume')
		await button.click()
		await this.assertAlternativeText(button,1,'Halt','Resume')
		await button.click()
		await this.assertAlternativeText(button,0,'Halt','Resume')
	})
	it("halts/resumes note refreshes when entering/exiting offline mode",async function(){
		const page=await this.openPage()
		const tool=await this.waitForTool(`Refresh notes`)
		await tool.click()
		const button=await tool.$('button')
		await this.assertAlternativeText(button,0,'Halt','Resume')
		await page.setOfflineMode(true)
		await this.assertAlternativeText(button,1,'Halt','Resume')
		await page.setOfflineMode(false)
		await this.assertAlternativeText(button,0,'Halt','Resume')
	})
	it("halts/resumes note refreshes when clicking play button and, after that, entering/exiting offline mode",async function(){
		const page=await this.openPage()
		const tool=await this.waitForTool(`Refresh notes`)
		await tool.click()
		const button=await tool.$('button')
		await this.assertAlternativeText(button,0,'Halt','Resume')
		await button.click()
		await this.assertAlternativeText(button,1,'Halt','Resume')
		await button.click()
		await this.assertAlternativeText(button,0,'Halt','Resume')
		await page.setOfflineMode(true)
		await this.assertAlternativeText(button,1,'Halt','Resume')
		await page.setOfflineMode(false)
		await this.assertAlternativeText(button,0,'Halt','Resume')
	})
})

async function readJson(downloadsFilename) {
	return JSON.parse(
		await fs.readFile(downloadsFilename,'utf-8')
	)
}
