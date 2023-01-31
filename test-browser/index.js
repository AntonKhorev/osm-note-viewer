import {strict as assert} from 'assert'
import * as fs from 'fs/promises'
import url from 'url'
import puppeteer from 'puppeteer'
import runOsmServer from '../tools/osm-server.js'
import runClientServer from '../tools/client-server.js'
import build from '../tools/build.js'

const useClientServer=true
const keepBrowser=true
const visible=!!process.env.npm_config_visible
const browserOptions=visible?{
	headless: false,
	slowMo: 200
}:{}

const downloads=await readJson('downloads.json')
const dstDir='test-build/dist'

// can test XPath in browser like this:
// document.evaluate(`//button[not(@disabled) and contains(.,"Halt")]`,document).iterateNext()
const buttonPath=(text)=>`//button[not(@disabled) and contains(.,"${text}")]`
const containsClassCondition=(className)=>`contains(concat(' ', @class, ' '), ' ${className} ')` // https://stackoverflow.com/a/1604480

describe("browser tests",function(){
	if (visible) this.timeout(0)
	before(async function(){
		this.timeout(0)
		if (useClientServer) {
			this.clientServer=await runClientServer(dstDir)
			this.clientUrl=this.clientServer.url
		} else {
			this.clientUrl=`${url.pathToFileURL(`${dstDir}/index.html`)}`
		}
		this.osmServer=await runOsmServer(this.clientUrl)
		await build([{
			web: this.osmServer.url,
			tiles: `${this.osmServer.url}{z}/{x}/{y}.png`,
			note: `Test server bundled on ${new Date().toISOString()}`
		}],'src',dstDir,'cache',downloads)
		if (keepBrowser) this.browser=await puppeteer.launch(browserOptions)
	})
	after(async function(){
		if (keepBrowser) await this.browser.close()
		await this.osmServer.close()
		if (useClientServer) {
			await this.clientServer.close()
		}
	})
	beforeEach(async function(){
		this.timeout(0)
		this.osmServer.clearData()
		if (!keepBrowser) this.browser=await puppeteer.launch(browserOptions)
		const page=await this.browser.newPage()
		this.openPage=async(path='')=>{
			await page.goto(this.clientUrl+path)
			return page
		}
		this.waitForFetchButton=()=>page.waitForXPath(`//button[not(@disabled) and contains(.,"Fetch notes")]`)
		this.waitForTool=(summaryText)=>page.waitForXPath(`//details[${containsClassCondition('tool')} and contains(./summary,"${summaryText}")]`)
		this.getToAboutTab=async()=>{
			await this.waitForFetchButton()
			const aboutTab=await page.$('#tab-About')
			await aboutTab.click()
		}
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
		this.osmServer.setNotes([{
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
		this.osmServer.setNotes([{
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
		this.osmServer.setNotes([{
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
	it("cleans up previous note status on note update",async function(){
		const checkClass=(el,className)=>el.evaluate(
			(el,className)=>el.classList.contains(className),
			className
		)
		const assertHasClass=async(el,className)=>{
			assert.equal(await checkClass(el,className),true,`element doesn't have expected class "${className}"`)
		}
		const assertHasNoClass=async(el,className)=>{
			assert.equal(await checkClass(el,className),false,`element has unexpected class "${className}"`)
		}
		this.osmServer.setNotes([{
			"id": 101,
			"comments": [{
				"date": "2022-04-01",
				"text": "needs-fixing"
			}]
		}])
		const page=await this.openPage()
		const fetchButton=await this.waitForFetchButton()
		await fetchButton.click()
		{
			const noteSection=await page.waitForSelector('.notes tbody')
			await assertHasClass(noteSection,'open')
			await assertHasNoClass(noteSection,'closed')
		}
		this.osmServer.setNotes([{
			"id": 101,
			"comments": [{
				"date": "2022-04-01",
				"text": "needs-fixing"
			},{
				"date": "2022-04-02",
				"text": "done-fixing",
				"action": "closed"
			}],
			"status": "closed"
		}])
		const updateLink=await page.$(`.notes tbody a`)
		await updateLink.click()
		await page.waitForSelector('.notes tbody tr + tr')
		{
			const noteSection=await page.waitForSelector('.notes tbody')
			await assertHasNoClass(noteSection,'open')
			await assertHasClass(noteSection,'closed')
		}
	})

	// refresher

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
		this.osmServer.setNotes([{
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
		this.osmServer.setNotes([{
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

	// logins

	it("has login button when app is registered",async function(){
		const page=await this.openPage()
		const probeLoginButton=async()=>{
			await page.waitForXPath(`//button[contains(.,"Login")]`,{visible:true,timeout:1000})
		}
		await this.getToAboutTab()
		const clientIdInput=await page.$('#auth-app-client-id')
		await clientIdInput.type('fake')
		await probeLoginButton()
		await page.reload()
		await this.getToAboutTab()
		await probeLoginButton()
	})
	it("has error message when directly opening page with oauth redirect parameters",async function(){
		const page=await this.openPage('?code=wrong')
		await this.assertText(page,"outside of a popup")
	})
	it("can log in",async function(){
		this.osmServer.setLogin(true)
		const page=await this.openPage()
		const tool=await this.waitForTool(`Interact`)
		await tool.click()
		await this.assertNoText(tool,"logged-in-user-name")
		await this.getToAboutTab()
		const clientIdInput=await page.$('#auth-app-client-id')
		await clientIdInput.type('id')
		const aboutSection=await page.$('#tab-panel-About')
		const [loginSection]=await aboutSection.$x(`//section[contains(h3,"Logins")]`)
		const loginButton=await loginSection.waitForXPath(`//button[contains(.,"Login")]`,{visible:true,timeout:1000})
		await this.assertNoText(loginSection,"logged-in-user-name")
		loginButton.click()
		await loginSection.waitForSelector('table')
		await this.assertText(loginSection,"logged-in-user-name")
		await this.assertText(tool,"logged-in-user-name")
	})
})

async function readJson(downloadsFilename) {
	return JSON.parse(
		await fs.readFile(downloadsFilename,'utf-8')
	)
}
