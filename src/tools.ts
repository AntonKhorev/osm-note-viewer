import type {Note} from './data'
import {NoteMap} from './map'
import CommentWriter, {makeDateOutput} from './comment-writer'
import downloadAndShowElement from './osm'
import {toReadableDate, toUrlDate} from './query-date'
import {makeElement, makeLink, makeLabel, escapeXml, makeEscapeTag} from './util'

const p=(...ss: Array<string|HTMLElement>)=>makeElement('p')()(...ss)
const em=(s: string)=>makeElement('em')()(s)
const dfn=(s: string)=>makeElement('dfn')()(s)

type ToolElements = Array<string|HTMLElement>

export type ToolFitMode = 'allNotes' | 'inViewNotes' | undefined

export interface ToolCallbacks {
	onFitModeChange(fromTool: Tool, fitMode: ToolFitMode): void
	onTimestampChange(fromTool: Tool, timestamp: string): void
	onToolOpenToggle(fromTool: Tool, setToOpen: boolean): void
}

export abstract class Tool {
	private $buttonsRequiringSelectedNotes: HTMLButtonElement[] = []
	constructor(public id: string, public name: string, public title?: string ) {}
	abstract getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements
	getInfo(): ToolElements|undefined { return undefined }
	onTimestampChange(timestamp: string): boolean { return false }
	onNoteCountsChange(nFetched: number, nVisible: number): boolean { return false }
	onSelectedNotesChange(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): boolean {
		let reactedToButtons=false
		if (this.$buttonsRequiringSelectedNotes.length>0) {
			for (const $button of this.$buttonsRequiringSelectedNotes) {
				$button.disabled=selectedNotes.length<=0
			}
			reactedToButtons=true
		}
		const reactedToOthers=this.onSelectedNotesChangeWithoutHandlingButtons(selectedNotes,selectedNoteUsers)
		return reactedToButtons||reactedToOthers
	}
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): boolean { return false }
	protected makeRequiringSelectedNotesButton(): HTMLButtonElement {
		const $button=document.createElement('button')
		$button.disabled=true
		this.$buttonsRequiringSelectedNotes.push($button)
		return $button
	}
}

class AutozoomTool extends Tool {
	constructor() {super(
		'autozoom',
		`Automatic zoom`,
		`Pan and zoom the map to visible notes`
	)}
	getInfo() {return[p(
		`Pan and zoom the map to notes in the table. `,
		`Can be used as `,em(`zoom to data`),` for notes layer if `,dfn(`to all notes`),` is selected. `,
	),p(
		dfn(`To notes in table view`),` allows to track notes in the table that are currently visible on screen, panning the map as you scroll through the table. `,
		`This option is convenient to use when `,em(`Track between notes`),` map layer is enabled (and it is enabled by default). This way you can see the current sequence of notes from the table on the map, connected by a line in an order in which they appear in the table.`
	)]}
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		const $fitModeSelect=document.createElement('select')
		$fitModeSelect.append(
			new Option('is disabled','none'),
			new Option('to notes in table view','inViewNotes'),
			new Option('to all notes','allNotes')
		)
		$fitModeSelect.addEventListener('change',()=>{
			if ($fitModeSelect.value=='allNotes') {
				callbacks.onFitModeChange(this,$fitModeSelect.value)
				map.fitNotes()
			} else if ($fitModeSelect.value=='inViewNotes') {
				callbacks.onFitModeChange(this,$fitModeSelect.value)
				map.fitNoteTrack()
			} else {
				callbacks.onFitModeChange(this,undefined)
			}
		})
		return [$fitModeSelect]
	}
}

class TimestampTool extends Tool {
	private $timestampInput=document.createElement('input')
	constructor() {super(
		'timestamp',
		`Timestamp for historic queries`
	)}
	getInfo() {return[p(
		`Allows to select a timestamp for use with `,em(`Overpass`),` and `,em(`Overpass turbo`),` commands. `,
		`You can either enter the timestamp in ISO format (or anything else that Overpass understands) manually here click on a date of/in a note comment. `,
		`If present, a `,makeLink(`date setting`,`https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#date`),` is added to Overpass queries. `,
		`The idea is to allow for examining the OSM data at the moment some note was opened/commented/closed to evaluate if this action was correct.`
	),p(
		`Timestamps inside note comments are usually generated by apps like `,makeLink(`MAPS.ME`,`https://wiki.openstreetmap.org/wiki/MAPS.ME`),` to indicate their OSM data version.`
	)]}
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		// this.$timestampInput.type='datetime-local' // no standard datetime input for now because they're being difficult with UTC and 24-hour format.
		// this.$timestampInput.step='1'
		this.$timestampInput.type='text'
		this.$timestampInput.size=20
		this.$timestampInput.addEventListener('input',()=>{
			callbacks.onTimestampChange(this,this.$timestampInput.value)
		})
		const $clearButton=document.createElement('button')
		$clearButton.textContent='Clear'
		$clearButton.addEventListener('click',()=>{
			this.$timestampInput.value=''
			callbacks.onTimestampChange(this,'')
		})
		return [this.$timestampInput,` `,$clearButton]
	}
	onTimestampChange(timestamp: string): boolean {
		this.$timestampInput.value=timestamp
		return true
	}
}

class ParseTool extends Tool {
	constructor() {super(
		'parse',
		`Parse links`
	)}
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		// const commentWriter=new CommentWriter(map,)
		const $input=document.createElement('input')
		const $parseButton=document.createElement('button')
		$parseButton.textContent='Parse'
		$parseButton.addEventListener('click',()=>{
			// TODO
		})
		return [$input,` `,$parseButton]
	}
}

abstract class OverpassTool extends Tool {
	protected timestamp: string = ''
	onTimestampChange(timestamp: string): boolean {
		this.timestamp=timestamp
		return true
	}
	protected getOverpassQueryPreamble(map: NoteMap): string {
		const bounds=map.bounds
		let query=''
		if (this.timestamp) query+=`[date:"${this.timestamp}"]\n`
		query+=`[bbox:${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}]\n`
		query+=`;\n`
		return query
	}
}

class OverpassTurboTool extends OverpassTool {
	constructor() {super(
		'overpass-turbo',
		`Overpass turbo`
	)}
	getInfo() {return[p(
		`Some Overpass queries to run from `,
		makeLink(`Overpass turbo`,'https://wiki.openstreetmap.org/wiki/Overpass_turbo'),
		`, web UI for Overpass API. `,
		`Useful to inspect historic data at the time a particular note comment was made.`
	)]}
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		const $overpassButtons: HTMLButtonElement[] = []
		const buttonClickListener=(withRelations: boolean, onlyAround: boolean)=>{
			const e=makeEscapeTag(encodeURIComponent)
			let query=this.getOverpassQueryPreamble(map)
			if (withRelations) {
				query+=`nwr`
			} else {
				query+=`nw`
			}
			if (onlyAround) {
				const radius=10
				query+=`(around:${radius},${map.lat},${map.lon})`
			}
			query+=`;\n`
			query+=`out meta geom;`
			const location=`${map.lat};${map.lon};${map.zoom}`
			const url=e`https://overpass-turbo.eu/?C=${location}&Q=${query}`
			open(url,'overpass-turbo')
		}
		{
			const $button=document.createElement('button')
			$button.append(`Load `,makeMapIcon('area'),` without relations`)
			$button.addEventListener('click',()=>buttonClickListener(false,false))
			$overpassButtons.push($button)
		}{
			const $button=document.createElement('button')
			$button.append(`Load `,makeMapIcon('area'),` with relations`)
			$button.title=`May fetch large unwanted relations like routes.`
			$button.addEventListener('click',()=>buttonClickListener(true,false))
			$overpassButtons.push($button)
		}{
			const $button=document.createElement('button')
			$button.append(`Load around `,makeMapIcon('center'))
			$button.addEventListener('click',()=>buttonClickListener(false,true))
			$overpassButtons.push($button)
		}
		const result: ToolElements = []
		for (const $button of $overpassButtons) {
			result.push(` `,$button)
		}
		return result
	}
}

class OverpassDirectTool extends OverpassTool {
	constructor() {super(
		'overpass',
		`Overpass`
	)}
	getInfo() {return[p(
		`Query `,makeLink(`Overpass API`,'https://wiki.openstreetmap.org/wiki/Overpass_API'),` without going through Overpass turbo. `,
		`Shows results on the map. Also gives link to the element page on the OSM website.`
	)]}
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		const $button=document.createElement('button')
		$button.append(`Find closest node to `,makeMapIcon('center'))
		const $a=document.createElement('a')
		$a.innerText=`link`
		$button.addEventListener('click',async()=>{
			$button.disabled=true
			$a.removeAttribute('href')
			try {
				const radius=10
				let query=this.getOverpassQueryPreamble(map)
				query+=`node(around:${radius},${map.lat},${map.lon});\n`
				query+=`out skel;`
				const doc=await makeOverpassQuery($button,query)
				if (!doc) return
				const closestNodeId=getClosestNodeId(doc,map.lat,map.lon)
				if (!closestNodeId) {
					$button.classList.add('error')
					$button.title=`Could not find nodes nearby`
					return
				}
				const url=`https://www.openstreetmap.org/node/`+encodeURIComponent(closestNodeId)
				$a.href=url
				const that=this
				downloadAndShowElement(
					$a,map,
					(readableDate)=>makeDateOutput(readableDate,function(){
						that.timestamp=this.dateTime
						callbacks.onTimestampChange(that,this.dateTime)
					}),
					'node',closestNodeId
				)
			} finally {
				$button.disabled=false
			}
		})
		return [$button,` `,$a]
	}
}

class RcTool extends Tool {
	private selectedNotes: ReadonlyArray<Note> = []
	constructor() {super(
		'rc',
		`RC`,
		`JOSM (or another editor) Remote Control`
	)}
	getInfo() {return[p(
		`Load note/map data to an editor with `,
		makeLink(`remote control`,'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl'),
		`.`
	)]}
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		const e=makeEscapeTag(encodeURIComponent)
		const $loadNotesButton=this.makeRequiringSelectedNotesButton()
		$loadNotesButton.append(`Load `,makeNotesIcon('selected'))
		$loadNotesButton.addEventListener('click',async()=>{
			for (const {id} of this.selectedNotes) {
				const noteUrl=e`https://www.openstreetmap.org/note/${id}`
				const rcUrl=e`http://127.0.0.1:8111/import?url=${noteUrl}`
				const success=await openRcUrl($loadNotesButton,rcUrl)
				if (!success) break
			}
		})
		const $loadMapButton=document.createElement('button')
		$loadMapButton.append(`Load `,makeMapIcon('area'))
		$loadMapButton.addEventListener('click',()=>{
			const bounds=map.bounds
			const rcUrl=e`http://127.0.0.1:8111/load_and_zoom`+
				`?left=${bounds.getWest()}&right=${bounds.getEast()}`+
				`&top=${bounds.getNorth()}&bottom=${bounds.getSouth()}`
			openRcUrl($loadMapButton,rcUrl)
		})
		return [$loadNotesButton,` `,$loadMapButton]
	}
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): boolean {
		this.selectedNotes=selectedNotes
		return true
	}
}

class IdTool extends Tool {
	constructor() {super(
		'id',
		`iD`
	)}
	getInfo() {return[p(
		`Follow your notes by zooming from one place to another in one `,makeLink(`iD editor`,'https://wiki.openstreetmap.org/wiki/ID'),` window. `,
		`It could be faster to do first here in note-viewer than in iD directly because note-viewer won't try to download more data during panning. `,
		`After zooming in note-viewer, click the `,em(`Open`),` button to open this location in iD. `,
		`When you go back to note-viewer, zoom to another place and click the `,em(`Open`),` button for the second time, the already opened iD instance zooms to that place. `,
		`Your edits are not lost between such zooms.`
	),p(
		`Technical details: this is an attempt to make something like `,em(`remote control`),` in iD editor. `,
		`Convincing iD to load notes has proven to be tricky. `,
		`Your best chance of seeing the selected notes is importing them as a `,em(`gpx`),` file. `,
		`See `,makeLink(`this diary post`,`https://www.openstreetmap.org/user/Anton%20Khorev/diary/398991`),` for further explanations.`,
	),p(
		`Zooming/panning is easier to do, and that's what is currently implemented. `,
		`It's not without quirks however. You'll notice that the iD window opened from here doesn't have the OSM website header. `,
		`This is because the editor is opened at `,makeLink(`/id`,`https://www.openstreetmap.org/id`),` url instead of `,makeLink(`/edit`,`https://www.openstreetmap.org/edit`),`. `,
		`It has to be done because otherwise iD won't listen to `,em(`#map`),` changes in the webpage location.`
	)]}
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		// limited to what hashchange() lets you do here https://github.com/openstreetmap/iD/blob/develop/modules/behavior/hash.js
		// which is zooming/panning
		const $zoomButton=document.createElement('button')
		$zoomButton.append(`Open `,makeMapIcon('center'))
		$zoomButton.addEventListener('click',()=>{
			const e=makeEscapeTag(encodeURIComponent)
			const url=e`https://www.openstreetmap.org/id#map=${map.zoom}/${map.lat}/${map.lon}`
			open(url,'id')
		})
		return [$zoomButton]
	}
}

class GpxTool extends Tool {
	private selectedNotes: ReadonlyArray<Note> = []
	private selectedNoteUsers: ReadonlyMap<number,string> = new Map()
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
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		const $connectSelect=document.createElement('select')
		$connectSelect.append(
			new Option(`without connections`,'no'),
			new Option(`connected by route`,'rte'),
			new Option(`connected by track`,'trk')
		)
		const $commentsSelect=document.createElement('select')
		$commentsSelect.append(
			new Option(`first comment`,'first'),
			new Option(`all comments`,'all')
		)
		const $dataTypeSelect=document.createElement('select')
		$dataTypeSelect.append(
			new Option('text/xml'),
			new Option('application/gpx+xml'),
			new Option('text/plain')
		)
		const $exportNotesButton=this.makeRequiringSelectedNotesButton()
		$exportNotesButton.append(`Export `,makeNotesIcon('selected'))
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
		const getGpx=(): string => {
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
						if ($commentsSelect.value=='all') gpx+=e` ${comment.action}`
						gpx+=` at ${toReadableDate(comment.date)}`
						if (comment.text) gpx+=e`: ${comment.text}`
						if ($commentsSelect.value!='all') break
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
			if ($connectSelect.value=='rte') {
				gpx+=`<rte>\n`
				gpx+=getPoints('rtept')
				gpx+=`</rte>\n`
			}
			if ($connectSelect.value=='trk') {
				gpx+=`<trk><trkseg>\n`
				gpx+=getPoints('trkpt')
				gpx+=`</trkseg></trk>\n`
			}
			gpx+=`</gpx>\n`
			return gpx
		}
		$exportNotesButton.addEventListener('click',()=>{
			const gpx=getGpx()
			const file=new File([gpx],'notes.gpx')
			const $a=document.createElement('a')
			$a.href=URL.createObjectURL(file)
			$a.download='notes.gpx'
			$a.click()
			URL.revokeObjectURL($a.href)
		})
		$exportNotesButton.draggable=true
		$exportNotesButton.addEventListener('dragstart',ev=>{
			const gpx=getGpx()
			if (!ev.dataTransfer) return
			ev.dataTransfer.setData($dataTypeSelect.value,gpx)
		})
		return [
			$exportNotesButton,` `,
			makeLabel('inline')(` as waypoints `,$connectSelect),` `,
			makeLabel('inline')(` with `,$commentsSelect,` in descriptions`),`, `,
			makeLabel('inline')(`set `,$dataTypeSelect,` type in drag and drop events`)
		]
	}
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): boolean {
		this.selectedNotes=selectedNotes
		this.selectedNoteUsers=selectedNoteUsers
		return true
	}
}

abstract class StreetViewTool extends Tool {
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		const $viewButton=document.createElement('button')
		$viewButton.append(`Open `,makeMapIcon('center'))
		$viewButton.addEventListener('click',()=>{
			open(this.generateUrl(map),this.id)
		})
		return [$viewButton]
	}
	protected abstract generateUrl(map: NoteMap): string
}

class YandexPanoramasTool extends StreetViewTool {
	constructor() {super(
		'yandex-panoramas',
		`Y.Panoramas`,
		`Yandex.Panoramas (Яндекс.Панорамы)`
	)}
	getInfo() {return[p(
		`Open a map location in `,makeLink(`Yandex.Panoramas`,'https://wiki.openstreetmap.org/wiki/RU:%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81.%D0%9F%D0%B0%D0%BD%D0%BE%D1%80%D0%B0%D0%BC%D1%8B'),` street view. `,
		`Could be useful to find out if an object mentioned in a note existed at a certain point of time. `,
		`Yandex.Panoramas have a year selector in the upper right corner. Use it to get a photo made close to the date of interest.`
	)]}
	protected generateUrl(map: NoteMap): string {
		const e=makeEscapeTag(encodeURIComponent)
		const coords=map.lon+','+map.lat
		return e`https://yandex.ru/maps/?ll=${coords}&panorama%5Bpoint%5D=${coords}&z=${map.zoom}` // 'll' is required if 'z' argument is present
	}
}

class MapillaryTool extends StreetViewTool {
	constructor() {super(
		'mapillary',
		`Mapillary`
	)}
	getInfo() {return[p(
		`Open a map location in `,makeLink(`Mapillary`,'https://wiki.openstreetmap.org/wiki/Mapillary'),`. `,
		`Not yet fully implemented. The idea is to jump straight to the best available photo, but in order to do that, Mapillary API has to be queried for available photos. That's impossible to do without an API key.`
	)]}
	protected generateUrl(map: NoteMap): string {
		const e=makeEscapeTag(encodeURIComponent)
		return e`https://www.mapillary.com/app/?lat=${map.lat}&lng=${map.lon}&z=${map.zoom}&focus=photo`
	}
}

class CountTool extends Tool {
	private $fetchedNoteCount=document.createElement('output')
	private $visibleNoteCount=document.createElement('output')
	private $selectedNoteCount=document.createElement('output')
	constructor() {super(
		'counts',
		`Note counts`
	)}
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		this.$fetchedNoteCount.textContent='0'
		this.$visibleNoteCount.textContent='0'
		this.$selectedNoteCount.textContent='0'
		return [
			this.$fetchedNoteCount,` fetched, `,
			this.$visibleNoteCount,` visible, `,
			this.$selectedNoteCount,` selected`
		]
	}
	onNoteCountsChange(nFetched: number, nVisible: number): boolean {
		this.$fetchedNoteCount.textContent=String(nFetched)
		this.$visibleNoteCount.textContent=String(nVisible)
		return true
	}
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): boolean {
		this.$selectedNoteCount.textContent=String(selectedNotes.length)
		return true
	}
}

class LegendTool extends Tool {
	constructor() {super(
		'legend',
		`Legend`,
		`What do icons in command panel mean`
	)}
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		return [
			makeMapIcon('center'),` = map center, `,makeMapIcon('area'),` = map area, `,makeNotesIcon('selected'),` = selected notes`
		]
	}
}

class SettingsTool extends Tool {
	constructor() {super(
		'settings',
		`⚙️`,
		`Settings`
	)}
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		const $openAllButton=document.createElement('button')
		$openAllButton.textContent=`+ open all tools`
		$openAllButton.addEventListener('click',()=>callbacks.onToolOpenToggle(this,true))
		const $closeAllButton=document.createElement('button')
		$closeAllButton.textContent=`− close all tools`
		$closeAllButton.addEventListener('click',()=>callbacks.onToolOpenToggle(this,false))
		return [$openAllButton,` `,$closeAllButton]
	}
}

export const toolMakerSequence: Array<()=>Tool> = [
	()=>new AutozoomTool, ()=>new TimestampTool, ()=>new ParseTool,
	()=>new OverpassTurboTool, ()=>new OverpassDirectTool,
	()=>new RcTool, ()=>new IdTool,
	()=>new GpxTool, ()=>new YandexPanoramasTool, ()=>new MapillaryTool,
	()=>new CountTool, ()=>new LegendTool, ()=>new SettingsTool
]

function makeMapIcon(type: string): HTMLImageElement {
	const $img=document.createElement('img')
	$img.classList.add('icon')
	$img.src=`map-${type}.svg`
	$img.width=19
	$img.height=13
	$img.alt=`map ${type}`
	return $img
}

function makeNotesIcon(type: string): HTMLImageElement {
	const $img=document.createElement('img')
	$img.classList.add('icon')
	$img.src=`notes-${type}.svg`
	$img.width=9
	$img.height=13
	$img.alt=`${type} notes`
	return $img
}

async function makeOverpassQuery($button: HTMLButtonElement, query: string): Promise<Document|undefined> {
	try {
		const response=await fetch(`https://www.overpass-api.de/api/interpreter`,{
			method: 'POST',
			body: new URLSearchParams({data:query})
		})
		const text=await response.text()
		if (!response.ok) {
			setError(`receiving the following message: ${text}`)
			return
		}
		clearError()
		return new DOMParser().parseFromString(text,'text/xml')
	} catch (ex) {
		if (ex instanceof TypeError) {
			setError(`with the following error before receiving a response: ${ex.message}`)
		} else {
			setError(`for unknown reason`)
		}
	}
	function setError(reason: string) {
		$button.classList.add('error')
		$button.title=`Overpass query failed ${reason}`
	}
	function clearError() {
		$button.classList.remove('error')
		$button.title=''
	}
}

function getClosestNodeId(doc: Document, centerLat: number, centerLon: number): string | undefined {
	let closestNodeId: string | undefined
	let closestNodeDistanceSquared=Infinity
	for (const node of doc.querySelectorAll('node')) {
		const lat=Number(node.getAttribute('lat'))
		const lon=Number(node.getAttribute('lon'))
		const id=node.getAttribute('id')
		if (!Number.isFinite(lat) || !Number.isFinite(lon) || !id) continue
		const distanceSquared=(lat-centerLat)**2+(lon-centerLon)**2
		if (distanceSquared<closestNodeDistanceSquared) {
			closestNodeDistanceSquared=distanceSquared
			closestNodeId=id
		}
	}
	return closestNodeId
}

async function openRcUrl($button: HTMLButtonElement, rcUrl: string): Promise<boolean> {
	try {
		const response=await fetch(rcUrl)
		if (response.ok) {
			clearError()
			return true
		}
	} catch {}
	setError()
	return false
	function setError() {
		$button.classList.add('error')
		$button.title='Remote control command failed. Make sure you have an editor open and remote control enabled.'
	}
	function clearError() {
		$button.classList.remove('error')
		$button.title=''
	}
}
