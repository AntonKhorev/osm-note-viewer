import * as fs from 'fs/promises'
import * as http from 'http'

const notesById=initializeNotes([{}])

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
		} else if (match=pathname.match(new RegExp('/api/0\\.6/notes/(\\d+)\\.json'))) {
			const [,id]=match
			respondToNote(response,Number(id))
		} else {
			response.writeHead(404)
			response.end(`Route not defined`)
		}
	})
	await new Promise((resolve)=>{
		server.listen(port).on('listening',resolve)
	})
	return {
		nodeServer: server,
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

function respondToSearch(response,query) {
	const notes=[...notesById.values()]
	const data={
		type: "FeatureCollection",
		features: notes.map(getNoteJson)
	}
	serveJson(response,data)
}

function respondToNote(response,id) {
	const note=notesById.get(id)
	if (!note) {
		response.writeHead(404)
		return response.end()
	}
	serveJson(response,getNoteJson(note))
}

function serveJson(response,data) {
	response.writeHead(200,{
		'access-control-allow-origin': '*',
		'content-type': 'application/json',
		'cache-control': 'no-cache',
	})
	response.end(JSON.stringify(data,undefined,2))
}

function getNoteJson(note) {
	return {
		type: "Feature",
		geometry: {
			type: "Point",
			coordinates: [note.lon, note.lat]
		},
		properties: {
			id: note.id,
			status: note.status,
			comments: note.comments.map(getNoteCommentJson)
		}
	}
}

function getNoteCommentJson(noteComment) {
	const json={}
	json.date=formatDate(noteComment.date)
	if (noteComment.uid!=null) json.uid=noteComment.uid
	if (noteComment.user!=null) json.user=noteComment.user
	json.action=noteComment.action
	json.text=noteComment.text
	return json
}

function formatDate(date) {
	return date.toISOString()
		.replace('T',' ')
		.replace(/\.\d\d\dZ/,' UTC')
}

function initializeNotes(noteList) {
	let id=0
	const fixComment=(inputComment,i)=>{
		const outputComment={}
		outputComment.date=inputComment.date??new Date('2023')
		outputComment.action=inputComment.action??i==0?'opened':'commented'
		outputComment.text=inputComment.text??''
		return outputComment
	}
	const fixNote=inputNote=>{
		const outputNote={}
		if (inputNote.id!=null) {
			id=outputNote.id=inputNote.id
		} else {
			outputNote.id=++id
		}
		outputNote.lat=inputNote.lat??0
		outputNote.lon=inputNote.lon??0
		outputNote.status=inputNote.status??'open'
		outputNote.comments=[]
		if (inputNote.comments!=null) {
			for (let i=0;i<inputNote.comments.length;i++) {
				outputNote.comments.push(fixComment(inputNote.comments[i],i))
			}
		} else {
			outputNote.comments.push(fixComment({},0))
		}
		return outputNote
	}
	return new Map(noteList.map(fixNote).map(note=>[note.id,note]))
}
