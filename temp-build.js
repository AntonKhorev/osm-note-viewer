import url from 'url'
import puppeteer from 'puppeteer'
import build from './tools/build.js'
import runServer from './tools/server.js'

const server=await runServer()
const serverHost=`127.0.0.1:${server.address().port}`
const serverUrl=`http://${serverHost}/`
const dstDir='test-build/dist'
await build('src',dstDir,'cache',[{
	web: serverUrl,
	tiles: `${serverUrl}{z}/{x}/{y}.png`,
	note: `Test server bundled on ${new Date().toISOString()}`
}])
console.log(`bundle ready`)
{
	// puppeteer
	const browserUrl=`${url.pathToFileURL(`${dstDir}/index.html`)}`
	const browser=await puppeteer.launch({headless:false})
	const page=await browser.newPage()
	await page.goto(browserUrl)
}
