import build from './tools/build.js'
import runServer from './tools/server.js'

const server=await runServer()
const serverUrl=`http://127.0.0.1:${server.address().port}/`
await build('src','dist','cache',[null,{
	web: serverUrl,
	tiles: `${serverUrl}{z}/{x}/{y}.png`,
	note: `Test server bundled on ${new Date().toISOString()}`
}])
console.log(`bundle ready`)
