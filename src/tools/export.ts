import type {
	Feature,
	FeatureCollection
} from 'geojson'

import {Tool, ToolElements, makeNotesIcon} from './base'
import type {Note, NoteComment} from '../data'
import type Server from '../server'
import {toReadableDate, toUrlDate} from '../query-date'
import {makeLink, makeLabel} from '../html'
import {em,dfn,code,p,ul,li} from '../html-shortcuts'
import {escapeXml, makeEscapeTag} from '../escape'

abstract class ExportTool extends Tool {
	protected inputNotes: ReadonlyArray<Note> = []
	protected inputNoteUsers: ReadonlyMap<number,string> = new Map()
	protected getInfo(): ToolElements {
		return [
			...this.getInfoWithoutDragAndDrop(),
			p(
				`Instead of clicking the `,em(`Export`),` button, you can drag it and drop into a place that accepts data sent by `,makeLink(`Drag and Drop API`,`https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API`),`. `,
				`Not many places actually do, and those who do often can handle only plaintext. `,
				`That's why there's a type selector, with which plaintext format can be forced on transmitted data.`
			)
		]
	}
	protected getTool($root: HTMLElement, $tool: HTMLElement): ToolElements {
		const $optionSelects=Object.fromEntries(
			Object.entries(this.describeOptions()).map(([key,valuesWithTexts])=>{
				const $select=document.createElement('select')
				$select.append(
					...valuesWithTexts.map(([value,text])=>new Option(text,value))
				)
				return [key,$select]
			})
		)
		const $dataTypeSelect=document.createElement('select')
		$dataTypeSelect.append(
			...this.listDataTypes().map(type=>new Option(type))
		)
		const $exportNotesButton=this.makeRequiringSelectedNotesButton()
		$exportNotesButton.append(`Export `,makeNotesIcon('selected'))
		$exportNotesButton.onclick=()=>{
			const data=this.generateData(this.auth.server,getOptionValues())
			const filename=this.generateFilename()
			const file=new File([data],filename)
			const $a=document.createElement('a')
			$a.href=URL.createObjectURL(file)
			$a.download=filename
			$a.click()
			URL.revokeObjectURL($a.href)
		}
		$exportNotesButton.draggable=true
		$exportNotesButton.ondragstart=(ev)=>{
			const data=this.generateData(this.auth.server,getOptionValues())
			if (!ev.dataTransfer) return
			ev.dataTransfer.setData($dataTypeSelect.value,data)
		}
		$root.addEventListener('osmNoteViewer:notesInput',ev=>{
			const [inputNotes,inputNoteUsers]=ev.detail
			this.inputNotes=inputNotes
			this.inputNoteUsers=inputNoteUsers
			this.ping($tool)
		})
		return [
			$exportNotesButton,` `,
			...this.writeOptions($optionSelects),`, `,
			makeLabel('inline')(`set `,$dataTypeSelect,` type in drag and drop events`)
		]
		function getOptionValues(): {[key:string]:string} {
			return Object.fromEntries(
				Object.entries($optionSelects).map(([key,$select])=>[key,$select.value])
			)
		}
	}
	protected abstract getInfoWithoutDragAndDrop(): ToolElements
	protected abstract describeOptions(): {[key:string]:[value:string,text:string][]}
	protected abstract writeOptions($selects:{[key:string]:HTMLSelectElement}): ToolElements
	protected abstract listDataTypes(): string[]
	protected abstract generateFilename(): string
	protected abstract generateData(server: Server, options: {[key:string]:string}): string
	protected getCommentStrings(comments: NoteComment[], all: boolean): string[] {
		const ts=[]
		for (const comment of comments) {
			let t=''
			if (comment.uid) {
				const username=this.inputNoteUsers.get(comment.uid)
				if (username!=null) {
					t+=`${username}`
				} else {
					t+=`user #${comment.uid}`
				}
			} else {
				t+=`anonymous user`
			}
			if (all) t+=` ${comment.action}`
			t+=` at ${toReadableDate(comment.date)}`
			if (comment.text) t+=`: ${comment.text}`
			ts.push(t)
			if (!all) break
		}
		return ts
	}
}

export class GpxTool extends ExportTool {
	id='gpx'
	name=`GPX`
	title=`Export selected notes to a .gpx file`
	protected getInfoWithoutDragAndDrop() {return[p(
		`Export selected notes in `,makeLink(`GPX`,'https://wiki.openstreetmap.org/wiki/GPX'),` (GPS exchange) format. `,
		`During the export, each selected note is treated as a waypoint with its name set to note id, description set to comments and link pointing to note's page on the OSM website. `,
		`This allows OSM notes to be used in applications that can't show them directly. `,
		`Also it allows a particular selection of notes to be shown if an application can't filter them. `,
		`One example of such app is `,makeLink(`iD editor`,'https://wiki.openstreetmap.org/wiki/ID'),`. `,
		`Unfortunately iD doesn't fully understand the gpx format and can't show links associated with waypoints. `,
		`You'll have to enable the notes layer in iD and compare its note marker with waypoint markers from the gpx file.`
	),p(
		`By default only the `,dfn(`first comment`),` is added to waypoint descriptions. `,
		`This is because some apps such as iD and especially `,makeLink(`JOSM`,`https://wiki.openstreetmap.org/wiki/JOSM`),` try to render the entire description in one line next to the waypoint marker, cluttering the map.`
	),p(
		`It's possible to pretend that note waypoints are connected by a `,makeLink(`route`,`https://www.topografix.com/GPX/1/1/#type_rteType`),` by using the `,dfn(`connected by route`),` option. `,
		`This may help to go from a note to the next one in an app by visually following the route line. `,
		`There's also the `,dfn(`connected by track`),` option in case the app makes it easier to work with `,makeLink(`tracks`,`https://www.topografix.com/GPX/1/1/#type_trkType`),` than with the routes.`
	)]}
	protected describeOptions(): {[key:string]:[value:string,text:string][]} {
		return {
			connect: [
				['no',`without connections`],
				['rte',`connected by route`],
				['trk',`connected by track`],
			],
			commentQuantity: [
				['first',`first comment`],
				['all',`all comments`],
			]
		}
	}
	protected writeOptions($selects:{[key:string]:HTMLSelectElement}): ToolElements {
		return [
			makeLabel('inline')(`as waypoints `,$selects.connect),` `,
			makeLabel('inline')(`with `,$selects.commentQuantity,` in descriptions`),
		]
	}
	protected listDataTypes(): string[] {
		return ['text/xml','application/gpx+xml','text/plain']
	}
	protected generateFilename(): string {
		return 'notes.gpx'
	}
	protected generateData(server: Server, options: {connect:string,commentQuantity:string}): string {
		const e=makeEscapeTag(escapeXml)
		const getPoints=(pointTag: string, getDetails: (note: Note) => string = ()=>''): string => {
			let gpx=''
			for (const note of this.inputNotes) {
				const firstComment=note.comments[0]
				gpx+=e`<${pointTag} lat="${note.lat}" lon="${note.lon}">\n`
				if (firstComment) gpx+=e`<time>${toUrlDate(firstComment.date)}</time>\n`
				gpx+=getDetails(note)
				gpx+=e`</${pointTag}>\n`
			}
			return gpx
		}
		let gpx=e`<?xml version="1.0" encoding="UTF-8" ?>\n`
		gpx+=e`<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">\n`
		// TODO <name>selected notes of user A</name>
		gpx+=getPoints('wpt',note=>{
			let gpx=''
			gpx+=e`<name>${note.id}</name>\n`
			if (note.comments.length>0) {
				gpx+=`<desc>`
				gpx+=this.getCommentStrings(note.comments,options.commentQuantity=='all').map(escapeXml).join(`&#xA;\n`) // JOSM wants this kind of double newline, otherwise no space between comments is rendered
				gpx+=`</desc>\n`
			}
			const noteUrl=server.web.getUrl(`note/`+encodeURIComponent(note.id))
			gpx+=e`<link href="${noteUrl}">\n`
			gpx+=e`<text>note #${note.id} on osm</text>\n`
			gpx+=e`</link>\n`
			gpx+=e`<type>${note.status}</type>\n`
			return gpx
		})
		if (options.connect=='rte') {
			gpx+=`<rte>\n`
			gpx+=getPoints('rtept')
			gpx+=`</rte>\n`
		}
		if (options.connect=='trk') {
			gpx+=`<trk><trkseg>\n`
			gpx+=getPoints('trkpt')
			gpx+=`</trkseg></trk>\n`
		}
		gpx+=`</gpx>\n`
		return gpx
	}
}

export class GeoJsonTool extends ExportTool {
	id='geojson'
	name=`GeoJSON`
	title=`Export selected notes to a .geojson file`
	protected getInfoWithoutDragAndDrop() {return[p(
		`Export selected notes in `,makeLink(`GeoJSON`,'https://wiki.openstreetmap.org/wiki/GeoJSON'),` format. `,
		`The exact features and properties exported are made to be close to OSM API `,code(`.json`),` output:`
	),ul(
		li(`the entire note collection is represented as a `,makeLink(`FeatureCollection`,'https://www.rfc-editor.org/rfc/rfc7946.html#section-3.3')),
		li(`each note is represented as a `,makeLink(`Point`,'https://www.rfc-editor.org/rfc/rfc7946.html#section-3.1.2'),` `,makeLink(`Feature`,'https://www.rfc-editor.org/rfc/rfc7946.html#section-3.2'))
	),p(
		`There are few differences to OSM API output, not including modifications using tool options described later:`,
	),ul(
		li(`comments don't have `,code(`html`),` property, their content is available only as plaintext`),
		li(`dates may be incorrect in case of hidden note comments (something that happens very rarely)`)
	),p(
		`Like GPX exports, this tool allows OSM notes to be used in applications that can't show them directly. `,
		`Also it allows a particular selection of notes to be shown if an application can't filter them. `,
		`One example of such app is `,makeLink(`iD editor`,'https://wiki.openstreetmap.org/wiki/ID'),`. `,
		`Given that GeoJSON specification doesn't define what goes into feature properties, the support for rendering notes this way is lower than the one of GPX export. `,
		`Particularly neither iD nor JOSM seem to render any labels for note markers. `,
		`Also clicking the marker in JOSM is not going to open the note webpage. `,
		`On the other hand there's more clarity about how to to display properties outside of the editor map view. `,
		`All of the properties are displayed like `,makeLink(`OSM tags`,'https://wiki.openstreetmap.org/wiki/Tags'),`, which opens some possibilities: `
	),ul(
		li(`properties are editable in JOSM with a possibility to save results to a file`),
		li(`it's possible to access the note URL in iD, something that was impossible with GPX format`)
	),p(
		`While accessing the URLs, note that they are OSM API URLs, not the website URLs you might expect. `,
		`This is how OSM API outputs them. `,
		`Since that might be inconvenient, there's an `,dfn(`OSM website URLs`),` option. `,
		`With it you're able to select the note url in iD by triple-clicking its value.`
	),p(
		`Another consequence of displaying properties like tags is that they work best when they are strings. `,
		`OSM tags are strings, and that's what editors expect to display in their tag views. `,
		`When used for properties of notes, there's one non-string property: `,em(`comments`),`. `,
		`iD is unable to display it. `,
		`If you want to force comments to be represented by strings, like in GPX exports, there's an options for that. `,
		`There's also option to output each comment as a separate property, making it easier to see them all in the tags table.`
	),p(
		`It's possible to pretend that note points are connected by a `,makeLink(`LineString`,`https://www.rfc-editor.org/rfc/rfc7946.html#section-3.1.4`),` by using the `,dfn(`connected by line`),` option. `,
		`This may help to go from a note to the next one in an app by visually following the route line. `,
		`However, enabling the line makes it difficult to click on note points in iD.`
	)]}
	protected describeOptions(): {[key:string]:[value:string,text:string][]} {
		return {
			connect: [
				['no',`without connections`],
				['line',`connected by line`],
			],
			urls: [
				['api',`OSM API`],
				['web',`OSM website`],
			],
			commentQuantity: [
				['all',`all comments`],
				['first',`first comment`],
			],
			commentType: [
				['array',`array property`],
				['string',`string property`],
				['strings',`separate string properties`],
			],
		}
	}
	protected writeOptions($selects:{[key:string]:HTMLSelectElement}): ToolElements {
		return [
			makeLabel('inline')(`as points `,$selects.connect),` `,
			makeLabel('inline')(`with `,$selects.urls,` URLs in properties`),` and `,
			makeLabel('inline')($selects.commentQuantity,` of each note `),
			makeLabel('inline')(`written as `,$selects.commentType),
		]
	}
	protected listDataTypes(): string[] {
		return ['application/json','application/geo+json','text/plain']
	}
	protected generateFilename(): string {
		return 'notes.geojson' // JOSM doesn't like .json
	}
	protected generateData(server: Server, options: {connect:string,urls:string,commentQuantity:string,commentType:string}): string {
		// https://github.com/openstreetmap/openstreetmap-website/blob/master/app/views/api/notes/_note.json.jbuilder
		const e=makeEscapeTag(encodeURIComponent)
		const formatDate=(date:number):string=>{
			return toReadableDate(date)+' UTC'
		}
		const lastCloseComment=(note: Note):NoteComment|undefined=>{
			for (let i=note.comments.length-1;i>=0;i--) {
				if (note.comments[i].action=='closed') return note.comments[i]
			}
		}
		const generateCommentUserProperties=(comment:NoteComment):{[key:string]:string|number}=>{
			const result: {[key:string]:string|number} = {}
			if (comment.uid==null) return result
			result.uid=comment.uid
			const username=this.inputNoteUsers.get(comment.uid)
			if (username==null) return result
			result.user=username
			if (options.urls=='web') {
				result.user_url=server.web.getUrl(e`user/${username}`)
			} else {
				result.user_url=server.api.getRootUrl(e`user/${username}`)
			}
			return result
		}
		const generateNoteUrls=(note:Note):{[key:string]:string}=>{
			if (options.urls=='web') return {
				url: server.web.getUrl(e`note/${note.id}`)
			}
			const apiBasePath= e`notes/${note.id}`
			const result: {[key:string]:string} = {
				url: server.api.getUrl(apiBasePath+`.json`)
			}
			if (note.status=='closed') {
				result.reopen_url=server.api.getUrl(apiBasePath+`/reopen.json`)
			} else {
				result.comment_url=server.api.getUrl(apiBasePath+`/comment.json`)
				result.close_url=server.api.getUrl(apiBasePath+`/close.json`)
			}
			return result
		}
		const generateNoteDates=(note:Note):{[key:string]:string}=>{
			const result: {[key:string]:string} = {}
			if (note.comments.length>0) {
				result.date_created=formatDate(note.comments[0].date)
				if (note.status=='closed') {
					const closeComment=lastCloseComment(note)
					if (closeComment) {
						result.closed_at=formatDate(closeComment.date)
					}
				}
			}
			return result
		}
		const generateNoteComments=(comments:NoteComment[]):{[key:string]:any}=>{
			if (comments.length==0) return {}
			if (options.commentType=='strings') {
				return Object.fromEntries(
					this.getCommentStrings(comments,options.commentQuantity=='all').map((v,i)=>['comment'+(i>0?i+1:''),v.replace(/\n/g,'\n ')])
				)
			} else if (options.commentType=='string') {
				return {
					comments: this.getCommentStrings(comments,options.commentQuantity=='all').join(`; `).replace(/\n/g,'\n ')
				}
			} else {
				const toPropObject=(comment: NoteComment)=>({
					date: formatDate(comment.date),
					...generateCommentUserProperties(comment),
					action: comment.action,
					text: comment.text
				})
				if (options.commentQuantity=='all') {
					return {
						comments: comments.map(toPropObject)
					}
				} else {
					return {
						comments: [toPropObject(comments[0])]
					}
				}
			}
		}
		const features: Feature[] = this.inputNotes.map(note=>({
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [note.lon,note.lat]
			},
			properties: {
				id: note.id,
				...generateNoteUrls(note),
				...generateNoteDates(note),
				status: note.status,
				...generateNoteComments(note.comments),
			}
		}))
		if (options.connect=='line' && this.inputNotes.length>1) {
			features.push({
				type: 'Feature',
				geometry: {
					type: 'LineString',
					coordinates: this.inputNotes.map(note=>[note.lon,note.lat]),
				},
				properties: null
			})
		}
		const featureCollection: FeatureCollection = {
			type: 'FeatureCollection',
			features
		}
		return JSON.stringify(featureCollection,undefined,2)
	}
}
