import * as fs from 'fs/promises'
import * as http from 'http'

const files={
	'index.css': 'text/css; charset=utf-8',
	'index.html': 'text/html; charset=utf-8',
	'index.js': 'application/javascript; charset=utf-8',
	'leaflet.css': 'text/css; charset=utf-8',
	'leaflet.js': 'application/javascript; charset=utf-8',
	'images/layers.png': 'image/png',
	'images/layers-2x.png': 'image/png',
	'images/marker-icon.png': 'image/png',
}

export default async function runClientServer(filesystemPath,port=0) {
	const server=http.createServer(async(request,response)=>{
		let [,filename]=request.url.match(/^\/([^?]*)/)
		if (filename=='') filename='index.html'
		const contentType=files[filename]
		if (contentType) {
			const data=await fs.readFile(`${filesystemPath}/${filename}`)
			response.writeHead(200,{
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=60, immutable',
			})
			response.end(data)
		} else {
			response.writeHead(404)
			response.end(`File not found`)
		}
	})
	await new Promise((resolve)=>{
		server.listen(port).on('listening',resolve)
	})
	return {
		get url() {
			return `http://127.0.0.1:${server.address().port}/`
		},
		async close() {
			server.close()
			return new Promise(resolve=>{
				server.on('close',()=>{
					resolve()
				})
			})
		}
	}
}
