import type {Note} from './data'
import NoteViewerStorage from './storage'
import {NoteMap} from './map'
import {toReadableDate, toUrlDate} from './query-date'
import {makeLink, makeLabel, escapeXml, makeEscapeTag} from './util'

type CommandGroup = [
	id: string,
	name: string,
	title: string | undefined,
	getTool: (cp: CommandPanel, map: NoteMap)=>Array<string|HTMLElement>,
	getInfo?: ()=>Array<string|HTMLElement>
]

export default class CommandPanel {
	// { TODO register callbacks from command groups instead
	private $fitModeSelect=document.createElement('select')
	private $commentTimeSelect=document.createElement('select')
	private $commentTimeInput=document.createElement('input')
	private $fetchedNoteCount=document.createElement('span')
	private $visibleNoteCount=document.createElement('span')
	private $checkedNoteCount=document.createElement('span')
	// }
	private $buttonsRequiringSelectedNotes: HTMLButtonElement[] = []
	private checkedNotes: ReadonlyArray<Note> = []
	private checkedNoteUsers: ReadonlyMap<number,string> = new Map()
	private checkedCommentTime?: string
	private checkedCommentText?: string
	static commandGroups: CommandGroup[] = [[
		'autozoom',
		`Automatic zoom`,,
		(cp,map)=>{
			cp.$fitModeSelect.append(
				new Option('is disabled','none'),
				new Option('to notes in table view','inViewNotes'),
				new Option('to all notes','allNotes')
			)
			cp.$fitModeSelect.addEventListener('change',()=>{
				if (cp.fitMode=='allNotes') {
					map.fitNotes()
				} else if (cp.fitMode=='inViewNotes') {
					map.fitNoteTrack()
				}
			})
			return [cp.$fitModeSelect]
		}
	],[
		'timestamp',
		`Timestamp for historic queries`,,
		(cp,map)=>{
			const $commentTimeSelectLabel=document.createElement('label')
			cp.$commentTimeSelect.append(
				new Option('from comment text','text'),
				new Option('of comment','comment'),
			)
			$commentTimeSelectLabel.append(`pick time `,cp.$commentTimeSelect)
			$commentTimeSelectLabel.title=`"from comment text" looks for time inside the comment text. Useful for MAPS.ME-generated comments. Falls back to the comment time if no time detected in the text.`
			cp.$commentTimeSelect=cp.$commentTimeSelect
			const $commentTimeInputLabel=document.createElement('label')
			// cp.$commentTimeInput.type='datetime-local'
			// cp.$commentTimeInput.step='1'
			cp.$commentTimeInput.type='text'
			cp.$commentTimeInput.size=20
			// cp.$commentTimeInput.readOnly=true
			$commentTimeInputLabel.append(`picked `,cp.$commentTimeInput)
			$commentTimeInputLabel.title=`In whatever format Overpass understands. No standard datetime input for now because they're being difficult with UTC and 24-hour format.`
			cp.$commentTimeSelect.addEventListener('input',()=>cp.pickCommentTime())
			const $clearButton=document.createElement('button')
			$clearButton.textContent='Clear'
			$clearButton.addEventListener('click',()=>{
				cp.$commentTimeInput.value=''
			})
			return [$commentTimeSelectLabel,` — `,$commentTimeInputLabel, ` `,$clearButton]
		}
	],[
		'overpass-turbo',
		`Overpass turbo`,,
		(cp,map)=>{
			const $overpassButtons: HTMLButtonElement[] = []
			const buttonClickListener=(withRelations: boolean, onlyAround: boolean)=>{
				const center=map.getCenter()
				let query=cp.getOverpassQueryPreamble(map)
				if (withRelations) {
					query+=`nwr`
				} else {
					query+=`nw`
				}
				if (onlyAround) {
					const radius=10
					query+=`(around:${radius},${center.lat},${center.lng})`
				}
				query+=`;\n`
				query+=`out meta geom;`
				const location=`${center.lat};${center.lng};${map.getZoom()}`
				const url=`https://overpass-turbo.eu/?C=${encodeURIComponent(location)}&Q=${encodeURIComponent(query)}`
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
			const result: Array<string|HTMLElement> = []
			for (const $button of $overpassButtons) {
				result.push(` `,$button)
			}
			return result
		},
		()=>[
			`Some Overpass queries to run from `,
			makeLink(`Overpass turbo`,'https://wiki.openstreetmap.org/wiki/Overpass_turbo'),
			`, web UI for Overpass API. `,
			`Useful to inspect historic data at the time a particular note comment was made.`
		]
	],[
		'overpass',
		`Overpass`,,
		(cp,map)=>{
			const $button=document.createElement('button')
			$button.append(`Find closest node to `,makeMapIcon('center'))
			$button.addEventListener('click',async()=>{
				$button.disabled=true
				try {
					const radius=10
					const center=map.getCenter()
					let query=cp.getOverpassQueryPreamble(map)
					query+=`node(around:${radius},${center.lat},${center.lng});\n`
					query+=`out skel;`
					const doc=await makeOverpassQuery($button,query)
					if (!doc) return
					const closestNodeId=getClosestNodeId(doc,center.lat,center.lng)
					if (!closestNodeId) {
						$button.classList.add('error')
						$button.title=`Could not find nodes nearby`
						return
					}
					const url=`https://www.openstreetmap.org/node/`+encodeURIComponent(closestNodeId)
					open(url)
				} finally {
					$button.disabled=false
				}
			})
			return [$button]
		},
		()=>[
			makeLink(`Overpass API`,'https://wiki.openstreetmap.org/wiki/Overpass_API')
		]
	],[
		'rc',
		`RC`,
		`JOSM (or another editor) Remote Control`,
		(cp,map)=>{
			const e=makeEscapeTag(encodeURIComponent)
			const $loadNotesButton=cp.makeRequiringSelectedNotesButton()
			$loadNotesButton.append(`Load `,makeNotesIcon('selected'))
			$loadNotesButton.addEventListener('click',async()=>{
				for (const {id} of cp.checkedNotes) {
					const noteUrl=e`https://www.openstreetmap.org/note/${id}`
					const rcUrl=e`http://127.0.0.1:8111/import?url=${noteUrl}`
					const success=await openRcUrl($loadNotesButton,rcUrl)
					if (!success) break
				}
			})
			const $loadMapButton=document.createElement('button')
			$loadMapButton.append(`Load `,makeMapIcon('area'))
			$loadMapButton.addEventListener('click',()=>{
				const bounds=map.getBounds()
				const rcUrl=e`http://127.0.0.1:8111/load_and_zoom`+
					`?left=${bounds.getWest()}&right=${bounds.getEast()}`+
					`&top=${bounds.getNorth()}&bottom=${bounds.getSouth()}`

				openRcUrl($loadMapButton,rcUrl)
			})
			return [$loadNotesButton,` `,$loadMapButton]
		},
		()=>[
			`Load note/map data to an editor with `,
			makeLink(`remote control`,'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl'),
			`.`
		]
	],[
		'id',
		`iD`,,
		(cp,map)=>{
			// limited to what hashchange() lets you do here https://github.com/openstreetmap/iD/blob/develop/modules/behavior/hash.js
			// which is zooming/panning
			const $zoomButton=document.createElement('button')
			$zoomButton.append(`Open `,makeMapIcon('center'))
			$zoomButton.addEventListener('click',()=>{
				const e=makeEscapeTag(encodeURIComponent)
				const center=map.getCenter()
				const url=e`https://www.openstreetmap.org/id#map=${map.getZoom()}/${center.lat}/${center.lng}`
				open(url,'id')
			})
			return [$zoomButton]
		},
		()=>[
			makeLink(`iD editor`,'https://wiki.openstreetmap.org/wiki/ID')
		]
	],[
		'gpx',
		`GPX`,,
		(cp,map)=>{
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
			const $exportNotesButton=cp.makeRequiringSelectedNotesButton()
			$exportNotesButton.append(`Export `,makeNotesIcon('selected'))
			const e=makeEscapeTag(escapeXml)
			const getPoints=(pointTag: string, getDetails: (note: Note) => string = ()=>''): string => {
				let gpx=''
				for (const note of cp.checkedNotes) {
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
								const username=cp.checkedNoteUsers.get(comment.uid)
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
		},
		()=>[
			`Exports in `,
			makeLink(`GPX`,'https://wiki.openstreetmap.org/wiki/GPX'),
			` format.`
		]
	],[
		'yandex-panoramas',
		`Y.Panoramas`,
		`Yandex.Panoramas (Яндекс.Панорамы)`,
		(cp,map)=>{
			const $viewButton=document.createElement('button')
			$viewButton.append(`Open `,makeMapIcon('center'))
			$viewButton.addEventListener('click',()=>{
				const e=makeEscapeTag(encodeURIComponent)
				const center=map.getCenter()
				const coords=center.lng+','+center.lat
				const url=e`https://yandex.ru/maps/?ll=${coords}&panorama%5Bpoint%5D=${coords}&z=${map.getZoom()}` // 'll' is required if 'z' argument is present
				open(url,'yandex')
			})
			return [$viewButton]
		},
		()=>[
			makeLink(`Yandex.Panoramas`,'https://wiki.openstreetmap.org/wiki/RU:%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81.%D0%9F%D0%B0%D0%BD%D0%BE%D1%80%D0%B0%D0%BC%D1%8B')
		]
	],[
		'mapillary',
		`Mapillary`,,
		(cp,map)=>{
			const $viewButton=document.createElement('button')
			$viewButton.append(`Open `,makeMapIcon('center'))
			$viewButton.addEventListener('click',()=>{
				const e=makeEscapeTag(encodeURIComponent)
				const center=map.getCenter()
				const url=e`https://www.mapillary.com/app/?lat=${center.lat}&lng=${center.lng}&z=${map.getZoom()}&focus=photo`
				open(url,'mapillary')
			})
			return [$viewButton]
		},
		()=>[
			makeLink(`Mapillary`,'https://wiki.openstreetmap.org/wiki/Mapillary')
		]
	],[
		'counts',
		`Note counts`,,
		(cp,map)=>{
			cp.$fetchedNoteCount.textContent='0'
			cp.$visibleNoteCount.textContent='0'
			cp.$checkedNoteCount.textContent='0'
			return [
				cp.$fetchedNoteCount,` fetched, `,
				cp.$visibleNoteCount,` visible, `,
				cp.$checkedNoteCount,` selected`
			]
		}
	],[
		'legend',
		`Legend`,
		`What do icons in command panel mean`,
		(cp,map)=>[
			makeMapIcon('center'),` = map center, `,makeMapIcon('area'),` = map area, `,makeNotesIcon('selected'),` = selected notes`
		]
	]]
	constructor($container: HTMLElement, map: NoteMap, storage: NoteViewerStorage) {
		for (const [id,name,title,getTool,getInfo] of CommandPanel.commandGroups) {
			{
				const storageKey='commands-'+id
				const $commandGroup=document.createElement('details')
				$commandGroup.open=!!storage.getItem(storageKey)
				const $summary=document.createElement('summary')
				$summary.textContent=name
				if (title) $summary.title=title
				$commandGroup.addEventListener('toggle',()=>{
					if ($commandGroup.open) {
						storage.setItem(storageKey,'1')
					} else {
						storage.removeItem(storageKey)
					}
				})
				$commandGroup.append($summary,...getTool(this,map))
				$container.append($commandGroup)
			}
			if (getInfo) {
				const $commandGroupInfo=document.createElement('details')
				const $summary=document.createElement('summary')
				$summary.textContent=`${name} info`
				$commandGroupInfo.append($summary,...getInfo())
				$container.append($commandGroupInfo)
			}
		}
	}
	receiveNoteCounts(nFetched: number, nVisible: number) { // TODO receive one object with all/visible/selected notes
		this.$fetchedNoteCount.textContent=String(nFetched)
		this.$visibleNoteCount.textContent=String(nVisible)
	}
	receiveCheckedNotes(checkedNotes: ReadonlyArray<Note>, checkedNoteUsers: ReadonlyMap<number,string>): void {
		this.$checkedNoteCount.textContent=String(checkedNotes.length)
		this.checkedNotes=checkedNotes
		this.checkedNoteUsers=checkedNoteUsers
		for (const $button of this.$buttonsRequiringSelectedNotes) {
			$button.disabled=checkedNotes.length<=0
		}
	}
	receiveCheckedComment(checkedCommentTime?: string, checkedCommentText?: string): void {
		this.checkedCommentTime=checkedCommentTime
		this.checkedCommentText=checkedCommentText
		this.pickCommentTime()
	}
	get fitMode(): 'allNotes' | 'inViewNotes' | undefined {
		const mode=this.$fitModeSelect.value
		if (mode=='allNotes' || mode=='inViewNotes') return mode
	}
	disableFitting(): void {
		this.$fitModeSelect.value='none'
	}
	private pickCommentTime(): void {
		const setTime=(time:string):void=>{
			this.$commentTimeInput.value=time
		}
		if (this.$commentTimeSelect.value=='text' && this.checkedCommentText!=null) {
			const match=this.checkedCommentText.match(/\d\d\d\d-\d\d-\d\d[T ]\d\d:\d\d:\d\dZ/)
			if (match) {
				const [time]=match
				return setTime(time)
			}
		}
		setTime(this.checkedCommentTime??'')
	}
	private getOverpassQueryPreamble(map: NoteMap): string {
		const time=this.$commentTimeInput.value
		const bounds=map.getBounds()
		let query=''
		if (time) query+=`[date:"${time}"]\n`
		query+=`[bbox:${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}]\n`
		// query+=`[bbox:${bounds.toBBoxString()}];\n` // nope, different format
		query+=`;\n`
		return query
	}
	private makeRequiringSelectedNotesButton(): HTMLButtonElement {
		const $button=document.createElement('button')
		$button.disabled=true
		this.$buttonsRequiringSelectedNotes.push($button)
		return $button
	}
}

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
