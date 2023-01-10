import url from 'url'
import puppeteer from 'puppeteer'
import build from './tools/build.js'
import runServer from './tools/server.js'

const server=await runServer()
const serverUrl=`http://127.0.0.1:${server.address().port}/`
const dstDir='test-build/dist'
await build('src',dstDir,'cache',[
	[`https://unpkg.com/leaflet@1.7.1/dist/leaflet.js`,`leaflet.js`,`sha512-XQoYMqMTK8LvdxXYG3nZ448hOEQiglfqkJs1NOQV44cWnUrBc8PkAOcXy20w0vlaXaVUearIOBhiXZ5V3ynxwA==`],
	[`https://unpkg.com/leaflet@1.7.1/dist/leaflet.css`,`leaflet.css`,`sha512-xodZBNTC5n17Xt2atTPuE1HxjVMSvLVW9ocqUKLsCC5CXdbqCmblAshOMAS6/keqq/sMZMZ19scR4PsZChSR7A==`],
	[`https://unpkg.com/leaflet@1.7.1/dist/images/layers.png`,`images/layers.png`],
	[`https://unpkg.com/leaflet@1.7.1/dist/images/layers-2x.png`,`images/layers-2x.png`],
	[`https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png`,`images/marker-icon.png`],
],[{
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
	browser.on('disconnected',()=>{
		server.close()
	})
}
