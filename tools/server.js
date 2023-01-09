import * as fs from 'fs/promises'
import * as http from 'http'

export default async function runServer(port=0) {
	const tileData=await fs.readFile(new URL('./tile.png',import.meta.url))
	const server=http.createServer(async(request,response)=>{
		const [pathname,query]=request.url.split(/\?(.*)/)
		let match
		if (pathname=='/') {
			response.end(`Welcome to fake osm server!`)
		} else if (pathname.match(/\.png/)) {
			response.writeHead(200,{
				'content-type': 'image/png',
				'cache-control': 'public, max-age=604800, immutable',
			})
			response.end(tileData)
		} else if (pathname=='/api/0.6/notes/search.json') {
			respondToSearch(response,query)
		} else if (match=pathname.match(new RegExp('/api/0\.6/notes/\d+\.json'))) {
			const [id]=match
			respondToNote(response,id)
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

function respondToSearch(response,query) {
	response.writeHead(200,{
		'access-control-allow-origin': '*',
		'content-type': 'application/json',
		'cache-control': 'no-cache',
	})
	const data={
		type: "FeatureCollection",
		features: []
	}
	response.end(JSON.stringify(data,undefined,2))
}

function respondToNote(response,id) {
	response.writeHead(404)
}
