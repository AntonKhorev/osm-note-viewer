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
const buttonTitlePath=(text)=>`//button[not(@disabled) and contains(@title,"${text}")]`
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
		await build(this.osmServer.config,'src',dstDir,'cache',downloads)
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
		if (keepBrowser) {
			if (
				this.currentTest.title=="hides note with comment" ||
				this.currentTest.title=="clears 'undo append' state after commenting with latest changeset"
			) { // restart browser hack - looks like it's required for all interaction tests
				await this.browser.close()
				this.browser=await puppeteer.launch(browserOptions)
			}
		} else {
			this.browser=await puppeteer.launch(browserOptions)
		}
		const page=await this.browser.newPage()
		this.openPage=async(path='')=>{
			await page.goto(this.clientUrl+path)
			return page
		}
		this.waitForFetchButton=()=>page.waitForXPath(buttonPath(`Fetch notes`),{visible:true})
		this.waitForTool=async(summaryText)=>{
			const toolbarSettingsButton=await page.waitForSelector(`.toolbar button.settings`)
			await toolbarSettingsButton.click()
			const checkbox=await page.waitForXPath(`//dialog//label[contains(.,"${summaryText}")]//input`)
			const checked=await (await checkbox.getProperty('checked')).jsonValue()
			if (!checked) await checkbox.click()
			await page.keyboard.press('Escape')
			return page.waitForXPath(`//details[${containsClassCondition('tool')} and contains(./summary,"${summaryText}")]`)
		}
		this.getToMenu=async()=>{
			await this.waitForFetchButton()
			const menuButton=await page.$('button.global.menu')
			await menuButton.click()
			return await page.$('.graphic-side .menu .panel')
		}
		const hasText=async(target,text)=>(await target.$x(`//*/text()[contains(.,"${text}")]`)).length
		const hasTitleText=async(target,text)=>(await target.$x(`//*[contains(@title,"${text}")]`)).length
		this.assertText=async(target,text)=>assert(await hasText(target,text),`missing expected text "${text}"`)
		this.assertNoText=async(target,text)=>assert(!await hasText(target,text),`present unexpected text "${text}"`)
		this.assertAlternativeTitleText=async(target,condition,text0,text1)=>{
			if (!condition) {
				assert( await hasTitleText(target,text0),`missing expected text "${text0}"`)
				assert(!await hasTitleText(target,text1),`present unexpected text "${text1}"`)
			} else {
				assert(!await hasTitleText(target,text0),`present unexpected text "${text0}"`)
				assert( await hasTitleText(target,text1),`missing expected text "${text1}"`)
			}
		}
		this.deleteAll=async()=>{
			await page.keyboard.down('Control')
			await page.keyboard.press('A')
			await page.keyboard.up('Control')
			await page.keyboard.press('Backspace')
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
			await assertHasClass(noteSection,'status-open')
			await assertHasNoClass(noteSection,'status-closed')
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
		const updateLink=await page.$(`.notes tbody .note-link a`)
		await updateLink.click()
		await page.waitForSelector('.notes tbody tr + tr')
		{
			const noteSection=await page.waitForSelector('.notes tbody')
			await assertHasNoClass(noteSection,'status-open')
			await assertHasClass(noteSection,'status-closed')
		}
	})
	it("keeps select all checkbox checked on note update",async function(){
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
		await page.waitForSelector('.notes tbody')
		{
			assert.equal(
				await page.$('.notes thead input:indeterminate'),
				null
			)
			assert.equal(
				await page.$('.notes thead input:checked'),
				null
			)
			assert.equal(
				await page.$('.notes tbody .note-checkbox input:checked'),
				null
			)
			const noteCheckbox=await page.$('.notes tbody .note-checkbox input')
			await noteCheckbox.click()
			assert.notEqual(
				await page.$('.notes thead input:checked'),
				null
			)
			assert.notEqual(
				await page.$('.notes tbody .note-checkbox input:checked'),
				null
			)
		}
		this.osmServer.setNotes([{
			"id": 101,
			"comments": [{
				"date": "2022-04-01",
				"text": "needs-fixing"
			},{
				"date": "2022-04-02",
				"text": "still-needs-fixing"
			}]
		}])
		const updateLink=await page.$(`.notes tbody .note-link a`)
		await updateLink.click()
		await page.waitForSelector('.notes tbody tr + tr')
		{
			assert.equal(
				await page.$('.notes thead input:indeterminate'),
				null
			)
			assert.notEqual(
				await page.$('.notes thead input:checked'),
				null
			)
			assert.notEqual(
				await page.$('.notes tbody .note-checkbox input:checked'),
				null
			)
		}
	})
	it("keeps note self-link focused on note update",async function(){
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
		await page.waitForSelector('.notes tbody')
		{
			assert.equal(
				await page.$('.notes tbody .note-link a:focus'),
				null
			)
		}
		this.osmServer.setNotes([{
			"id": 101,
			"comments": [{
				"date": "2022-04-01",
				"text": "needs-fixing"
			},{
				"date": "2022-04-02",
				"text": "still-needs-fixing"
			}]
		}])
		const updateLink=await page.$(`.notes tbody .note-link a`)
		await updateLink.click()
		await page.waitForSelector('.notes tbody tr + tr')
		{
			assert.notEqual(
				await page.$('.notes tbody .note-link a:focus'),
				null
			)
		}
	})
	it("has a gap between cancel/confirm clear settings buttons",async function(){
		const assertNotTouching=(box1,box2)=>{
			const {border:{3:{y:bottom1}}}=box1
			const {border:{0:{y:top2}}}=box2
			assert(top2-bottom1>1,`expected gap greater than 1, got ${top2-bottom1}`)
		}
		this.osmServer.setLogin(true)
		const page=await this.openPage()
		const tool=await this.waitForTool(`Interact`)
		await tool.click()
		await this.assertNoText(tool,"logged-in-user-name")
		const menuPanel=await this.getToMenu()
		const [storageSection]=await menuPanel.$x(`//section[contains(h2,"Storage")]`)
		const clearButton=await storageSection.waitForXPath(`//button[contains(.,"Clear")]`,{visible:true})
		await clearButton.click()
		const cancelButton=await storageSection.waitForXPath(`//button[contains(.,"Cancel")]`,{visible:true})
		const confirmButton=await storageSection.waitForXPath(`//button[contains(.,"Confirm")]`,{visible:true})
		assertNotTouching(
			await cancelButton.boxModel(),
			await confirmButton.boxModel()
		)
	})
	it("runs auto-updating bbox query",async function(){
		this.osmServer.setNotes([{
			"text": "the-only-note-comment"
		}])
		const page=await this.openPage('#map=10/0/0')
		await this.waitForFetchButton()
		await this.assertNoText(page,"the-only-note-comment")
		const bboxTab=await page.$('#tab-BBox')
		await bboxTab.click()
		const bboxPanel=await page.$('#tab-panel-BBox')
		const [trackMapSelect]=await bboxPanel.$x(`//select[contains(.,"Fetch")]`)
		await trackMapSelect.select('fetch')
		await page.waitForSelector('.notes tbody')
		await this.assertText(page,"the-only-note-comment")
	})
	it("gets back to previous bbox query",async function(){
		this.osmServer.setNotes([{
			"map": "1.5/1.5",
			"text": "the-first-note"
		},{
			"map": "2.5/2.5",
			"text": "the-second-note"
		}])
		const page=await this.openPage()
		await this.waitForFetchButton()
		await this.assertNoText(page,"the-first-note")
		await this.assertNoText(page,"the-second-note")
		const bboxTab=await page.$('#tab-BBox')
		await bboxTab.click()
		const bboxPanel=await page.$('#tab-panel-BBox')
		const [fetchButton]=await bboxPanel.$x(buttonPath("Fetch notes"))
		const bboxInput=await page.$('#tab-panel-BBox input[name=bbox]')
		const waitForBbox=async(bbox)=>{
			await page.waitForXPath(`//div[${containsClassCondition('notes')}]//caption/a[contains(.,"${bbox}")]`)
			await page.waitForSelector('.notes tbody')
		}
		const fetchBbox=async(bbox)=>{
			await bboxInput.focus()
			await this.deleteAll()
			await bboxInput.type(bbox)
			await fetchButton.click()
			await waitForBbox(bbox)
		}
		await fetchBbox('1,1,2,2')
		await this.assertText(page,"the-first-note")
		await this.assertNoText(page,"the-second-note")
		const url=page.url()
		assert.equal(
			url.endsWith(`&map=`),
			false,
			"empty map parameter in location hash"
		)
		await fetchBbox('2,2,3,3')
		await this.assertNoText(page,"the-first-note")
		await this.assertText(page,"the-second-note")
		await page.goBack()
		await waitForBbox('1,1,2,2')
		await this.assertText(page,"the-first-note")
		await this.assertNoText(page,"the-second-note")
	})

	// keyboard controls

	it("produces no errors with keyboard navigation",async function(){
		this.osmServer.setNotes([{
			"id": 101,
			"comments": [{
				"date": "2022-04-01",
				"text": "the-first-note-comment"
			}]
		}])
		const page=await this.openPage()
		const fetchButton=await this.waitForFetchButton()
		await fetchButton.click()
		await page.waitForSelector('.notes tbody')
		const commentCell=await page.$('.notes tbody .note-comment')
		await commentCell.click()
		let lastError
		page.on('pageerror',(error)=>{
			lastError=error
		})
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowRight')
		await page.keyboard.press('ArrowLeft')
		await page.keyboard.press('ArrowLeft')
		assert.notEqual(
			await page.$('.notes tbody .note-user:focus-within'),
			null
		)
		assert.equal(lastError,undefined)
		await page.keyboard.press('Home')
		await page.keyboard.down('Shift')
		await page.keyboard.press('ArrowUp')
		await page.keyboard.up('Shift')
		assert.equal(lastError,undefined)
	})
	it("enters and exits comment cell",async function(){
		const nodeUrl=id=>this.osmServer.url+'node/'+id
		const nodeSelector=id=>`.notes tbody .note-comment a[href="${nodeUrl(id)}"]`
		this.osmServer.setNotes([{
			"id": 101,
			"comments": [{
				"date": "2022-04-01",
				"text": "the-first-note-comment\n"+
					nodeUrl(1)+"\n"+
					nodeUrl(2)+"\n"+
					nodeUrl(3)
			}]
		}])
		const page=await this.openPage()
		const fetchButton=await this.waitForFetchButton()
		await fetchButton.click()
		await page.waitForSelector('.notes tbody')
		{
			const commentCell=await page.$('.notes tbody .note-comment')
			await commentCell.click()
		}
		assert.notEqual(
			await page.$('.notes tbody .note-comment:focus'),
			null
		)
		await page.keyboard.press('Enter')
		assert.notEqual(
			await page.$(nodeSelector(1)+':focus'),
			null
		)
		await page.keyboard.press('ArrowDown')
		assert.notEqual(
			await page.$(nodeSelector(2)+':focus'),
			null
		)
		await page.keyboard.press('Escape')
		assert.notEqual(
			await page.$('.notes tbody .note-comment:focus'),
			null
		)
		{
			const a=await page.$(nodeSelector(2))
			await a.click()
		}
		assert.notEqual(
			await page.$(nodeSelector(2)+':focus'),
			null
		)
		await page.keyboard.press('ArrowDown')
		assert.notEqual(
			await page.$(nodeSelector(3)+':focus'),
			null
		)
	})
	it("focuses on comment button when svg element clicked",async function(){
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
		const page=await this.openPage()
		const fetchButton=await this.waitForFetchButton()
		await fetchButton.click()
		await page.waitForSelector('.notes tbody')
		{
			const textSvgElement=await page.$('.notes tbody td.note-action button svg text')
			await textSvgElement.click()
		}
		assert.notEqual(
			await page.$('.notes tbody td.note-action button:focus'),
			null
		)
		await page.keyboard.press('ArrowRight')
		assert.notEqual(
			await page.$('.notes tbody td.note-date time:focus'),
			null
		)
	})

	// refresher

	it("halts/resumes note refreshes when clicking play button",async function(){
		const page=await this.openPage()
		const tool=await this.waitForTool(`Refresh`)
		await tool.click()
		const button=await tool.$('button')
		await this.assertAlternativeTitleText(button,0,'Halt','Resume')
		await button.click()
		await this.assertAlternativeTitleText(button,1,'Halt','Resume')
		await button.click()
		await this.assertAlternativeTitleText(button,0,'Halt','Resume')
	})
	it("halts/resumes note refreshes when entering/exiting offline mode",async function(){
		const page=await this.openPage()
		const tool=await this.waitForTool(`Refresh`)
		await tool.click()
		const button=await tool.$('button')
		await this.assertAlternativeTitleText(button,0,'Halt','Resume')
		await page.setOfflineMode(true)
		await this.assertAlternativeTitleText(button,1,'Halt','Resume')
		await page.setOfflineMode(false)
		await this.assertAlternativeTitleText(button,0,'Halt','Resume')
	})
	it("halts/resumes note refreshes when clicking play button and, after that, entering/exiting offline mode",async function(){
		const page=await this.openPage()
		const tool=await this.waitForTool(`Refresh`)
		await tool.click()
		const button=await tool.$('button')
		await this.assertAlternativeTitleText(button,0,'Halt','Resume')
		await button.click()
		await this.assertAlternativeTitleText(button,1,'Halt','Resume')
		await button.click()
		await this.assertAlternativeTitleText(button,0,'Halt','Resume')
		await page.setOfflineMode(true)
		await this.assertAlternativeTitleText(button,1,'Halt','Resume')
		await page.setOfflineMode(false)
		await this.assertAlternativeTitleText(button,0,'Halt','Resume')
	})
	it("replaces note after it has reported update",async function(){
		this.osmServer.setNotes([{
			"id": 101,
			"comments": [{
				"date": "2022-04-01",
				"text": "the-first-note-comment"
			}]
		}])
		const page=await this.openPage()
		const fetchButton=await this.waitForFetchButton()
		const tool=await this.waitForTool(`Refresh`)
		await tool.click()
		const [haltButton]=await tool.$x(buttonTitlePath('Halt'))
		const [refreshButton]=await tool.$x(buttonTitlePath('Refresh'))
		await this.assertNoText(page,"the-first-note-comment")
		await this.assertNoText(page,"the-second-note-comment")
		await haltButton.click()
		await fetchButton.click()
		await page.waitForSelector('.notes tbody')
		await this.assertText(page,"the-first-note-comment")
		await this.assertNoText(page,"the-second-note-comment")
		{
			const updateLink=await page.$('.notes tbody td.note-link a[title*=reload]')
			assert.notEqual(updateLink,null)
			await updateLink.focus()
		}
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
		{
			const updateLink=await page.$('.notes tbody td.note-link a[title*=reload]')
			assert.notEqual(updateLink,null)
		}
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
		{
			const menuPanel=await this.getToMenu()
			await menuPanel.waitForXPath(buttonPath(`Login`),{visible:true})
			const [loginButton]=await menuPanel.$x(buttonPath(`Login`))
			const [appSection]=await menuPanel.$x(`//section[contains(h2,"Register app")]`)
			await (await appSection.$('details > summary')).click()
			const clientIdInput=await menuPanel.$('#auth-app-client-id')
			await clientIdInput.focus()
			await this.deleteAll()
			await menuPanel.waitForXPath(`//div[${containsClassCondition('notice')} and contains(.,"Please register")]`,{visible:true})
			assert.equal(await loginButton.boundingBox(),null)
			await clientIdInput.type('fake')
			await menuPanel.waitForXPath(buttonPath(`Login`),{visible:true})
		}
		await page.reload()
		{
			const menuPanel=await this.getToMenu()
			await menuPanel.waitForXPath(buttonPath(`Login`),{visible:true})
		}
	})
	it("has error message when directly opening page with oauth redirect parameters",async function(){
		const page=await this.openPage('?code=wrong')
		await this.assertText(page,"outside of a popup")
	})
	it("logs in",async function(){
		this.osmServer.setLogin(true)
		const page=await this.openPage()
		const tool=await this.waitForTool(`Interact`)
		await tool.click()
		await this.assertNoText(tool,"logged-in-user-name")
		const menuPanel=await this.getToMenu()
		const [loginSection]=await menuPanel.$x(`//section[contains(h2,"Logins")]`)
		const loginButton=await loginSection.waitForXPath(`//button[contains(.,"Login")]`)
		await this.assertNoText(loginSection,"logged-in-user-name")
		loginButton.click()
		await loginSection.waitForSelector('table')
		await this.assertText(loginSection,"logged-in-user-name")
		await this.assertText(tool,"logged-in-user-name")
	})

	// note interaction

	it("hides note with comment",async function(){
		this.osmServer.setLogin(true)
		this.osmServer.setNotes([{
			"id": 101,
			"comments": [{
				"date": "2022-04-01",
				"text": "the-first-note-comment"
			}]
		}])
		const page=await this.openPage()
		// fetch note
		const fetchButton=await this.waitForFetchButton()
		await fetchButton.click()
		await page.waitForSelector('.notes tbody')
		// login
		const menuPanel=await this.getToMenu()
		const [loginSection]=await menuPanel.$x(`//section[contains(h2,"Logins")]`)
		const loginButton=await loginSection.waitForXPath(`//button[contains(.,"Login")]`,{visible:true,timeout:1000})
		loginButton.click()
		await loginSection.waitForSelector('table')
		// interact with note
		const noteCheckbox=await page.$(`.notes tbody .note-checkbox input`)
		await noteCheckbox.click()
		const tool=await this.waitForTool(`Interact`)
		await tool.click()
		const commentTextarea=await tool.$('textarea')
		await commentTextarea.type('h1d3-m3')
		const [hideButton]=await tool.$x(buttonPath('Hide'))
		await hideButton.click()
		await page.waitForSelector('.notes tbody tr + tr')
		assert.deepEqual(
			this.osmServer.lastRequest,
			{
				method: `DELETE`,
				url: `/api/0.6/notes/101.json`,
				body: `text=h1d3-m3`
			}
		)
	})
	it("clears 'undo append' state after commenting with latest changeset",async function(){
		this.osmServer.setLogin(true)
		this.osmServer.setNotes([{
			"id": 101,
			"comments": [{
				"date": "2022-04-01",
				"text": "the-first-note-comment"
			}]
		}])
		const page=await this.openPage()
		// fetch note
		const fetchButton=await this.waitForFetchButton()
		await fetchButton.click()
		await page.waitForSelector('.notes tbody')
		// login
		const menuPanel=await this.getToMenu()
		const [loginSection]=await menuPanel.$x(`//section[contains(h2,"Logins")]`)
		const loginButton=await loginSection.waitForXPath(`//button[contains(.,"Login")]`,{visible:true,timeout:1000})
		loginButton.click()
		await loginSection.waitForSelector('table')
		// interact with note
		const noteCheckbox=await page.$(`.notes tbody .note-checkbox input`)
		await noteCheckbox.click()
		const tool=await this.waitForTool(`Interact`)
		await tool.click()
		const assertAndGetTextControl=async(undo)=>{
			const [appendControl]=await tool.$x(`//a[${containsClassCondition("input-link")} and contains(.,"append last changeset")]`)
			const [undoControl]=await tool.$x(`//a[${containsClassCondition("input-link")} and contains(.,"undo append")]`)
			if (undo) {
				assert.equal(appendControl,undefined)
				assert.notEqual(undoControl,undefined)
				return undoControl
			} else {
				assert.notEqual(appendControl,undefined)
				assert.equal(undoControl,undefined)
				return appendControl
			}
		}
		const appendControl=await assertAndGetTextControl(false)
		await appendControl.click()
		const commentButton=await tool.waitForXPath(buttonPath(`Comment`))
		await assertAndGetTextControl(true)
		commentButton.click()
		await page.waitForSelector('.notes tbody tr + tr')
		await assertAndGetTextControl(false)
	})
})

async function readJson(downloadsFilename) {
	return JSON.parse(
		await fs.readFile(downloadsFilename,'utf-8')
	)
}
