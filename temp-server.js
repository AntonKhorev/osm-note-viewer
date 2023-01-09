import runServer from './tools/server.js'

const server=await runServer()
console.log(`server running at http://127.0.0.1:${server.address().port}/`)
