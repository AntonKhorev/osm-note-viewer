import * as fs from 'fs/promises'
import * as http from 'http'

export default async function runServer(port=0) {
	const tileData=await fs.readFile(new URL('./tile.png',import.meta.url))
	const server=http.createServer(async(request,response)=>{
		const [pathname,query]=request.url.split(/\?(.*)/)
		if (pathname=='/') {
			response.end(`Welcome to fake osm server!`)
		} else if (pathname.match(/\.png/)) {
			response.writeHead(200,{
				'Content-Type':'image/png',
				'Cache-Control':'public, max-age=604800, immutable',
			})
			response.end(tileData)
		} else {
			response.writeHead(404)
			response.end(`Route not defined`)
		}
	})
	await new Promise((resolve)=>{
		server.listen(port).on('listening',resolve)
	})
	return server
}
