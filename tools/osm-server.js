import * as fs from 'fs/promises'
import * as http from 'http'
import * as querystring from 'querystring'

let notesById=new Map()
let login={}

export default async function runOsmServer(authRedirectUrl,port=0) {
	const tileData=await fs.readFile(new URL('./tile.png',import.meta.url))
	let lastRequest
	const server=http.createServer(async(request,response)=>{
		// console.log('> osm server request',request.method,request.url)
		const body=await readRequestBody(request)
		lastRequest={
			method: request.method,
			url: request.url,
			body
		}
		if (request.method=='OPTIONS') {
			response.writeHead(204,{
				'access-control-allow-origin': '*',
				'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
				'access-control-allow-headers': 'authorization'
			})
			return response.end()
		}
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
		} else if (pathname=='/api/0.6/notes.json') {
			respondToBbox(response,query)
		} else if (pathname=='/api/0.6/notes/search.json') {
			respondToSearch(response,query)
		} else if (match=pathname.match(new RegExp('/api/0\\.6/notes/(\\d+)\\.json'))) {
			const [,id]=match
			if (request.method=='DELETE') {
				const params=querystring.parse(body)
				respondToNoteAction(response,Number(id),'hidden',params.text)
			} else {
				respondToNote(response,Number(id))
			}
		} else if (match=pathname.match(new RegExp('/api/0\\.6/notes/(\\d+)/comment\\.json'))) {
			const [,id]=match
			const params=querystring.parse(body)
			respondToNoteAction(response,Number(id),'commented',params.text)
		} else if (pathname=='/oauth2/authorize') {
			if (!login.authCode) {
				response.writeHead(200) // empty page displayed to the user telling
			} else {
				response.writeHead(302,{
					'location': `${authRedirectUrl}?${new URLSearchParams(login.authCode)}`
				})
			}
			response.end()
		} else if (pathname=='/oauth2/token') {
			if (!login.authToken) {
				serveJson(response,{
					error: `invalid_grant`,
					error_description: `The provided authorization grant is invalid, expired, revoked, does not match the redirection URI used in the authorization request, or was issued to another client.`
				},400)
			} else {
				serveJson(response,login.authToken)
			}
		} else if (pathname=='/api/0.6/user/details.json') {
			if (!login.userDetails) {
				response.writeHead(401,{
					'access-control-allow-origin': '*'
				})
				response.end(`Couldn't authenticate you`)
			} else {
				serveJson(response,login.userDetails)
			}
		} else if (pathname=='/api/0.6/changesets.json') {
			serveJson(response,{changesets:[{id:12345}]})
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
		get config() {
			return [{
				web: this.url,
				api: {
					noteSearchBbox: true
				},
				tiles: `${this.url}{z}/{x}/{y}.png`,
				note: `Test server bundled on ${new Date().toISOString()}`,
				oauth: {
					id: `client-id-on-test-server`
				}
			}]
		},
		get url() {
			return `http://127.0.0.1:${server.address().port}/`
		},
		get lastRequest() {
			return lastRequest
		},
		clearData() {
			notesById=new Map()
			login={}
		},
		setNotes(notesInput) {
			notesById=initializeNotes(notesInput)
		},
		setLogin(loginInput) {
			if (!loginInput) {
				login={}
				return
			}
			login={
				authCode: {
					"code":"auth-code-1"
				},
				authToken: {
					"access_token":"auth-token-1",
					"token_type":"Bearer",
					"scope":"read_prefs write_notes",
					"created_at":1674390614
				},
				userDetails: {
					"version":"0.6",
					"generator":"OpenStreetMap server",
					"copyright":"OpenStreetMap and contributors",
					"attribution":"http://www.openstreetmap.org/copyright",
					"license":"http://opendatacommons.org/licenses/odbl/1-0/",
					"user":{
						"id":1042,
						"display_name":"logged-in-user-name",
						"account_created":"2023-01-02T03:04:05Z",
						"description":"",
						"contributor_terms":{"agreed":true,"pd":false},
						"roles":["moderator"],
						"changesets":{"count":6},
						"traces":{"count":0},
						"blocks":{
							"received":{"count":0,"active":0},
							"issued":{"count":0,"active":0}},
							"languages":["en-US","en"],
							"messages":{
								"received":{"count":11,"unread":2},
								"sent":{"count":11}
							}
					}
				}
			}
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

function readRequestBody(request) {
	return new Promise((resolve,reject)=>{
		let body=''
		request.on('data',data=>{
			body+=data
			if (body.length>1e6) {
				request.connection.destroy()
				reject(`request body too long`)
			}
		}).on('end',()=>{
			resolve(body)
		})
	})
}

function respondToBbox(response,query) {
	const params=querystring.parse(query)
	const [left,bottom,right,top]=params.bbox.split(',')
	const notes=[...notesById.values()].filter(note=>(note.lat>=bottom && note.lat<=top && note.lon>=left && note.lon<=right))
	const data={
		type: "FeatureCollection",
		features: notes.map(getNoteJson)
	}
	serveJson(response,data)
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

function respondToNoteAction(response,id,action,text) {
	const now='2023-02'
	const note=notesById.get(id)
	if (!note) {
		response.writeHead(404)
		return response.end()
	}
	note.comments.push({
		date: new Date(now),
		action,
		text: text??''
	})
	serveJson(response,getNoteJson(note))
}

function serveJson(response,data,code=200) {
	response.writeHead(code,{
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
			date_created: formatDate(note.comments[0].date),
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
	const fixDate=(date)=>{
		if (date instanceof Date) {
			return date
		} else if (typeof date == 'string') {
			return new Date(date)
		} else {
			return new Date('2023')
		}
	}
	const fixComment=(inputComment,i)=>{
		const outputComment={}
		outputComment.date=fixDate(inputComment.date)
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
		if (typeof inputNote.map == 'string') {
			[outputNote.lat,outputNote.lon]=inputNote.map.split('/',2).map(Number)
		}
		outputNote.status=inputNote.status??'open'
		outputNote.comments=[]
		if (Array.isArray(inputNote.comments)) {
			for (let i=0;i<inputNote.comments.length;i++) {
				outputNote.comments.push(fixComment(inputNote.comments[i],i))
			}
		} else {
			outputNote.comments.push(fixComment(inputNote,0))
		}
		return outputNote
	}
	return new Map(noteList.map(fixNote).map(note=>[note.id,note]))
}
