import {strict as assert} from 'assert'
import * as fs from 'fs/promises'
import url from 'url'
import puppeteer from 'puppeteer'
import runServer from '../tools/server.js'
import {buildWithTestServer} from '../tools/build.js'

const keepBrowser=true
// const visible=true
const visible=false
const browserOptions=visible?{
	headless: false,
	slowMo: 200
}:{}

const downloads=await readJson('downloads.json')
const dstDir='test-build/dist'
const browserUrl=`${url.pathToFileURL(`${dstDir}/index.html`)}`

// can test XPath in browser like this:
// document.evaluate(`//button[not(@disabled) and contains(.,"Halt")]`,document).iterateNext()
const buttonPath=(text)=>`//button[not(@disabled) and contains(.,"${text}")]`

describe("browser tests",function(){
	if (visible) this.timeout(0)
	before(async function(){
		this.timeout(0)
		this.server=await runServer()
		await buildWithTestServer('src',dstDir,'cache',downloads,this.server.url)
		if (keepBrowser) this.browser=await puppeteer.launch(browserOptions)
	})
	after(async function(){
		if (keepBrowser) await this.browser.close()
		await this.server.close()
	})
	beforeEach(async function(){
		this.server.clearNotes()
		if (!keepBrowser) this.browser=await puppeteer.launch(browserOptions)
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
		if (!keepBrowser) await this.browser.close()
	})
	it("runs basic query",async function(){
		this.server.setNotes([{
			"text": "the-only-note-comment"
		}])
		const page=await this.openPage()
		const fetchButton=await this.waitForFetchButton()
		await this.assertNoText(page,"the-only-note-comment")
		await fetchButton.click()
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
		const fetchButton=await this.waitForFetchButton()
		await this.assertNoText(page,"the-first-note-comment")
		await this.assertNoText(page,"the-second-note-comment")
		await fetchButton.click()
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
	it("replaces note after it has reported update",async function(){
		this.timeout(5000)
		this.server.setNotes([{
			"id": 101,
			"comments": [{
				"date": "2022-04-01",
				"text": "the-first-note-comment"
			}]
		}])
		const page=await this.openPage()
		const fetchButton=await this.waitForFetchButton()
		const tool=await this.waitForTool(`Refresh notes`)
		await tool.click()
		const [haltButton]=await tool.$x(buttonPath('Halt'))
		const [refreshButton]=await tool.$x(buttonPath('Refresh'))
		await this.assertNoText(page,"the-first-note-comment")
		await this.assertNoText(page,"the-second-note-comment")
		await haltButton.click()
		await fetchButton.click()
		await page.waitForSelector('.notes tbody')
		await this.assertText(page,"the-first-note-comment")
		await this.assertNoText(page,"the-second-note-comment")
		await (await page.$('.notes tbody a')).focus()
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
		await refreshButton.click()
		await page.waitForSelector('.notes tbody[data-updated]')
		await this.assertText(page,"the-first-note-comment")
		await this.assertNoText(page,"the-second-note-comment")
		const [refreshSelect]=await tool.$x(`//select[contains(.,"replace")]`)
		await refreshSelect.select('replace')
		await refreshButton.click()
		await page.waitForSelector('.notes tbody tr + tr')
		await this.assertText(page,"the-first-note-comment")
		await this.assertText(page,"the-second-note-comment")
	})
	it("has login button in when app is registered",async function(){
		const page=await this.openPage()
		const getToAboutTab=async()=>{
			await this.waitForFetchButton()
			const aboutTab=await page.$('nav a[href="#section-About"]')
			await aboutTab.click()
		}
		const probeLoginButton=async()=>{
			await page.waitForXPath(`//button[contains(.,"Login")]`,{visible:true,timeout:1000})
		}
		await getToAboutTab()
		const clientIdInput=await page.$('#auth-app-client-id')
		await clientIdInput.type('fake')
		await probeLoginButton()
		await page.reload()
		await getToAboutTab()
		await probeLoginButton()
	})
})

async function readJson(downloadsFilename) {
	return JSON.parse(
		await fs.readFile(downloadsFilename,'utf-8')
	)
}
