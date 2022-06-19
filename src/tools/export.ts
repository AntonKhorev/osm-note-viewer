import type {
	Feature,
	FeatureCollection
} from 'geojson'

import {Tool, ToolElements, makeNotesIcon} from './base'
import type {Note, NoteComment} from '../data'
import {toReadableDate, toUrlDate} from '../query-date'
import {makeElement, makeLink, makeLabel, escapeXml, makeEscapeTag} from '../util'

type InfoElements = Array<string|HTMLElement>
const p=(...ss: InfoElements)=>makeElement('p')()(...ss)
const em=(s: string)=>makeElement('em')()(s)
const dfn=(s: string)=>makeElement('dfn')()(s)
const code=(s: string)=>makeElement('code')()(s)
const ul=(...ss: InfoElements)=>makeElement('ul')()(...ss)
const li=(...ss: InfoElements)=>makeElement('li')()(...ss)

abstract class ExportTool extends Tool {
	protected selectedNotes: ReadonlyArray<Note> = []
	protected selectedNoteUsers: ReadonlyMap<number,string> = new Map()
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): boolean {
		this.selectedNotes=selectedNotes
		this.selectedNoteUsers=selectedNoteUsers
		return true
	}
	getTool(): ToolElements {
		const $optionSelects=Object.fromEntries(
			Object.entries(this.describeOptions()).map(([key,valuesWithTexts])=>{
				const $select=document.createElement('select')
				$select.append(...valuesWithTexts.map(([value,text])=>new Option(text,value)))
				return [key,$select]
			})
		)
		const $dataTypeSelect=document.createElement('select')
		$dataTypeSelect.append(
			new Option('text/xml'),
			new Option('application/gpx+xml'),
			new Option('text/plain')
		)
		const $exportNotesButton=this.makeRequiringSelectedNotesButton()
		$exportNotesButton.append(`Export `,makeNotesIcon('selected'))
		$exportNotesButton.onclick=()=>{
			const data=this.generateData(getOptionValues())
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
			const data=this.generateData(getOptionValues())
			if (!ev.dataTransfer) return
			ev.dataTransfer.setData($dataTypeSelect.value,data)
		}
		return [
			$exportNotesButton,` `,
			...this.writeOptions($optionSelects),
			makeLabel('inline')(`set `,$dataTypeSelect,` type in drag and drop events`)
		]
		function getOptionValues(): {[key:string]:string} {
			return Object.fromEntries(
				Object.entries($optionSelects).map(([key,$select])=>[key,$select.value])
			)
		}
	}
	protected abstract describeOptions(): {[key:string]:[value:string,text:string][]}
	protected abstract writeOptions($selects:{[key:string]:HTMLSelectElement}): ToolElements
	protected abstract generateFilename(): string
	protected abstract generateData(options: {[key:string]:string}): string
}

export class GpxTool extends ExportTool {
	constructor() {super(
		'gpx',
		`GPX`
	)}
	getInfo() {return[p(
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
	),p(
		`Instead of clicking the `,em(`Export`),` button, you can drag it and drop into a place that accepts data sent by `,makeLink(`Drag and Drop API`,`https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API`),`. `,
		`Not many places actually do, and those who do often can handle only plaintext. `,
		`That's why there's a type selector, with which plaintext format can be forced on transmitted data.`
	)]}
	protected describeOptions(): {[key:string]:[value:string,text:string][]} {
		return {
			connect: [
				['no',`without connections`],
				['rte',`connected by route`],
				['trk',`connected by track`],
			],
			comments: [
				['first',`first comment`],
				['all',`all comments`],
			]
		}
	}
	protected writeOptions($selects:{[key:string]:HTMLSelectElement}): ToolElements {
		return [
			makeLabel('inline')(` as waypoints `,$selects.connect),` `,
			makeLabel('inline')(` with `,$selects.comments,` in descriptions`),`, `,
		]
	}
	protected generateFilename(): string {
		return 'notes.gpx'
	}
	protected generateData(options: {connect:string,comments:string}): string {
		const e=makeEscapeTag(escapeXml)
		const getPoints=(pointTag: string, getDetails: (note: Note) => string = ()=>''): string => {
			let gpx=''
			for (const note of this.selectedNotes) {
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
				let first=true
				for (const comment of note.comments) {
					if (first) {
						first=false
					} else {
						gpx+=`&#xA;\n` // JOSM wants this kind of double newline, otherwise no space between comments is rendered
					}
					if (comment.uid) {
						const username=this.selectedNoteUsers.get(comment.uid)
						if (username!=null) {
							gpx+=e`${username}`
						} else {
							gpx+=e`user #${comment.uid}`
						}
					} else {
						gpx+=`anonymous user`
					}
					if (options.comments=='all') gpx+=e` ${comment.action}`
					gpx+=` at ${toReadableDate(comment.date)}`
					if (comment.text) gpx+=e`: ${comment.text}`
					if (options.comments!='all') break
				}
				gpx+=`</desc>\n`
			}
			const noteUrl=`https://www.openstreetmap.org/note/`+encodeURIComponent(note.id)
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
	constructor() {super(
		'geojson',
		`GeoJSON`
	)}
	getInfo() {return[p(
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
		`All of the properties are displayed like OSM element tags, which opens some possibilities: `
	),ul(
		li(`properties are editable in JOSM with a possibility to save results to a file`),
		li(`it's possible to access the note url in iD, something that was impossible with GPX format`)
	),
/*
		`You'll have to enable the notes layer in iD and compare its note marker with waypoint markers from the gpx file.`
	),p(
		`By default only the `,dfn(`first comment`),` is added to waypoint descriptions. `,
		`This is because some apps such as iD and especially `,makeLink(`JOSM`,`https://wiki.openstreetmap.org/wiki/JOSM`),` try to render the entire description in one line next to the waypoint marker, cluttering the map.`
	),
*/
	p(
		`It's possible to pretend that note points are connected by a `,makeLink(`LineString`,`https://www.rfc-editor.org/rfc/rfc7946.html#section-3.1.4`),` by using the `,dfn(`connected by line`),` option. `,
		`This may help to go from a note to the next one in an app by visually following the route line. `,
		`However, enabling the line makes it difficult to click on note points in iD.`
	)
/*
	,p(
		`Instead of clicking the `,em(`Export`),` button, you can drag it and drop into a place that accepts data sent by `,makeLink(`Drag and Drop API`,`https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API`),`. `,
		`Not many places actually do, and those who do often can handle only plaintext. `,
		`That's why there's a type selector, with which plaintext format can be forced on transmitted data.`
	)
*/
	]}
	protected describeOptions(): {[key:string]:[value:string,text:string][]} {
		return {
			connect: [
				['no',`without connections`],
				['line',`connected by line`],
			],
			comments: [
				['first',`first comment`],
				['all',`all comments`],
			]
		}
	}
	protected writeOptions($selects:{[key:string]:HTMLSelectElement}): ToolElements {
		return [
			makeLabel('inline')(` as points `,$selects.connect),` `,
			makeLabel('inline')(` with `,$selects.comments,` in descriptions`),`, `,
		]
	}
	protected generateFilename(): string {
		return 'notes.geojson' // JOSM doesn't like .json
	}
	protected generateData(options: {connect:string,comments:string}): string {
		// https://github.com/openstreetmap/openstreetmap-website/blob/master/app/views/api/notes/_note.json.jbuilder
		const selectedNoteUsers=this.selectedNoteUsers
		const e=makeEscapeTag(encodeURIComponent)
		const features: Feature[] = this.selectedNotes.map(note=>({
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
				comments: note.comments.map(comment=>({
					date: formatDate(comment.date),
					...generateCommentUserProperties(comment),
					action: comment.action,
					text: comment.text
				}))
			}
		}))
		if (options.connect=='line' && this.selectedNotes.length>1) {
			features.push({
				type: 'Feature',
				geometry: {
					type: 'LineString',
					coordinates: this.selectedNotes.map(note=>[note.lon,note.lat]),
				},
				properties: null
			})
		}
		const featureCollection: FeatureCollection = {
			type: 'FeatureCollection',
			features
		}
		return JSON.stringify(featureCollection,undefined,2)
		function generateNoteUrls(note: Note): {[key:string]:string} {
			const urlBase= e`https://api.openstreetmap.org/api/0.6/notes/${note.id}`
			const result: {[key:string]:string} = {
				url: urlBase+`.json`
			}
			if (note.status=='closed') {
				result.reopen_url=urlBase+`/reopen.json`
			} else {
				result.comment_url=urlBase+`/comment.json`
				result.close_url=urlBase+`/close.json`
			}
			return result
		}
		function generateNoteDates(note: Note): {[key:string]:string} {
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
		function generateCommentUserProperties(comment: NoteComment): {[key:string]:string|number} {
			const result: {[key:string]:string|number} = {}
			if (comment.uid==null) return result
			result.uid=comment.uid
			const username=selectedNoteUsers.get(comment.uid)
			if (username==null) return result
			result.user=username
			result.user_url=e`https://api.openstreetmap.org/user/${username}`
			return result
		}
		function lastCloseComment(note: Note): NoteComment|undefined {
			for (let i=note.comments.length-1;i>=0;i--) {
				if (note.comments[i].action=='closed') return note.comments[i]
			}
		}
		function formatDate(date: number): string {
			return toReadableDate(date)+' UTC'
		}
	}
}
