import * as http from 'http'

export default (port=0)=>new Promise((resolve)=>{
	const server=http.createServer(async(request,response)=>{
		const [pathname,query]=request.url.split(/\?(.*)/)
		if (pathname=='/') {
			response.end(`Welcome to fake osm server!`)
		} else if (pathname.match(/\.png/)) {
			response.end(`TODO serve blank image`)
		} else {
			response.writeHead(404)
			response.end(`Route not defined`)
		}
	}).listen(process.env.PORT||0).on('listening',()=>{
		resolve(server)
	})
})
