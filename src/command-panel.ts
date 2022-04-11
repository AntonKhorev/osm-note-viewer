import type {Note} from './data'
import NoteViewerStorage from './storage'
import {NoteMap} from './map'
import {toReadableDate, toUrlDate} from './query-date'
import {makeLink, escapeXml, makeEscapeTag} from './util'

export default class CommandPanel {
	private $fitModeSelect=document.createElement('select')
	private $buttonsRequiringSelectedNotes: HTMLButtonElement[] = []
	private $commentTimeSelect: HTMLSelectElement
	private $commentTimeInput: HTMLInputElement
	private $fetchedNoteCount: HTMLSpanElement
	private $visibleNoteCount: HTMLSpanElement
	private $checkedNoteCount: HTMLSpanElement
	private checkedNotes: ReadonlyArray<Note> = []
	private checkedNoteUsers: ReadonlyMap<number,string> = new Map()
	private checkedCommentTime?: string
	private checkedCommentText?: string
	constructor($container: HTMLElement, map: NoteMap, storage: NoteViewerStorage) {
		{
			const $commandGroup=makeCommandGroup(
				'autozoom',
				`Automatic zoom`
			)
			this.$fitModeSelect.append(
				new Option('is disabled','none'),
				new Option('to notes in table view','inViewNotes'),
				new Option('to all notes','allNotes')
			)
			this.$fitModeSelect.addEventListener('change',()=>{
				if (this.fitMode=='allNotes') {
					map.fitNotes()
				} else if (this.fitMode=='inViewNotes') {
					map.fitNoteTrack()
				}
			})
			$commandGroup.append(this.$fitModeSelect)
		}{
			const $commandGroup=makeCommandGroup(
				'timestamp',
				`Timestamp for historic queries`
			)
			const $commentTimeSelectLabel=document.createElement('label')
			const $commentTimeSelect=document.createElement('select')
			$commentTimeSelect.append(
				new Option('from comment text','text'),
				new Option('of comment','comment'),
			)
			$commentTimeSelectLabel.append(`pick time `,$commentTimeSelect)
			$commentTimeSelectLabel.title=`"from comment text" looks for time inside the comment text. Useful for MAPS.ME-generated comments. Falls back to the comment time if no time detected in the text.`
			this.$commentTimeSelect=$commentTimeSelect
			const $commentTimeInputLabel=document.createElement('label')
			const $commentTimeInput=document.createElement('input')
			// $commentTimeInput.type='datetime-local'
			// $commentTimeInput.step='1'
			$commentTimeInput.type='text'
			$commentTimeInput.size=20
			// $commentTimeInput.readOnly=true
			$commentTimeInputLabel.append(`picked `,$commentTimeInput)
			$commentTimeInputLabel.title=`In whatever format Overpass understands. No standard datetime input for now because they're being difficult with UTC and 24-hour format.`
			this.$commentTimeInput=$commentTimeInput
			$commentTimeSelect.addEventListener('input',()=>this.pickCommentTime())
			const $clearButton=document.createElement('button')
			$clearButton.textContent='Clear'
			$clearButton.addEventListener('click',()=>{
				$commentTimeInput.value=''
			})
			$commandGroup.append($commentTimeSelectLabel,` — `,$commentTimeInputLabel, ` `,$clearButton)
		}{
			const $commandGroup=makeCommandGroup(
				'overpass-turbo',
				`Overpass turbo`,
				'https://wiki.openstreetmap.org/wiki/Overpass_turbo'
			)
			const $overpassButtons: HTMLButtonElement[] = []
			const buttonClickListener=(withRelations: boolean, onlyAround: boolean)=>{
				const center=map.getCenter()
				let query=this.getOverpassQueryPreamble(map)
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
			for (const $button of $overpassButtons) {
				$commandGroup.append(` `,$button)
			}
		}{
			const $commandGroup=makeCommandGroup(
				'overpass',
				`Overpass`,
				'https://wiki.openstreetmap.org/wiki/Overpass_API'
			)
			const $button=document.createElement('button')
			$button.append(`Find closest node to `,makeMapIcon('center'))
			$button.addEventListener('click',async()=>{
				$button.disabled=true
				try {
					const radius=10
					const center=map.getCenter()
					let query=this.getOverpassQueryPreamble(map)
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
			$commandGroup.append($button)
		}{
			const $commandGroup=makeCommandGroup(
				'rc',
				`RC`,
				'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl',
				`JOSM (or another editor) Remote Control`
			)
			const $loadNotesButton=this.makeRequiringSelectedNotesButton()
			$loadNotesButton.append(`Load `,makeNotesIcon('selected'))
			$loadNotesButton.addEventListener('click',async()=>{
				for (const {id} of this.checkedNotes) {
					const noteUrl=`https://www.openstreetmap.org/note/`+encodeURIComponent(id)
					const rcUrl=`http://127.0.0.1:8111/import?url=`+encodeURIComponent(noteUrl)
					const success=await openRcUrl($loadNotesButton,rcUrl)
					if (!success) break
				}
			})
			const $loadMapButton=document.createElement('button')
			$loadMapButton.append(`Load `,makeMapIcon('area'))
			$loadMapButton.addEventListener('click',()=>{
				const bounds=map.getBounds()
				const rcUrl=`http://127.0.0.1:8111/load_and_zoom`+
					`?left=`+encodeURIComponent(bounds.getWest())+
					`&right=`+encodeURIComponent(bounds.getEast())+
					`&top=`+encodeURIComponent(bounds.getNorth())+
					`&bottom=`+encodeURIComponent(bounds.getSouth())
				openRcUrl($loadMapButton,rcUrl)
			})
			$commandGroup.append($loadNotesButton,` `,$loadMapButton)
		}{
			const $commandGroup=makeCommandGroup(
				'gpx',
				`GPX`,
				'https://wiki.openstreetmap.org/wiki/GPX'
			)
			const $exportNotesButton=this.makeRequiringSelectedNotesButton()
			$exportNotesButton.append(`Export `,makeNotesIcon('selected'))
			$exportNotesButton.addEventListener('click',()=>{
				const e=makeEscapeTag(escapeXml)
				let gpx=e`<?xml version="1.0" encoding="UTF-8" ?>\n`
				gpx+=e`<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">\n`
				// TODO <name>selected notes of user A</name>
				for (const note of this.checkedNotes) {
					const firstComment=note.comments[0]
					gpx+=e`<wpt lat="${note.lat}" lon="${note.lon}">\n`
					if (firstComment) gpx+=e`<time>${toUrlDate(firstComment.date)}</time>\n`
					gpx+=e`<name>${note.id}</name>\n`
					if (firstComment) {
						gpx+=`<desc>`
						let first=true
						for (const comment of note.comments) {
							if (first) {
								first=false
							} else {
								gpx+=`\n`
							}
							if (comment.uid) {
								const username=this.checkedNoteUsers.get(comment.uid)
								if (username!=null) {
									gpx+=e`${username}`
								} else {
									gpx+=e`user #${comment.uid}`
								}
							} else {
								gpx+=`anonymous user`
							}
							gpx+=e` ${comment.action} at ${toReadableDate(comment.date)}`
							if (comment.text) gpx+=e`: ${comment.text}`
						}
						gpx+=`</desc>\n`
					}
					const noteUrl=`https://www.openstreetmap.org/note/`+encodeURIComponent(note.id)
					gpx+=e`<link href="${noteUrl}" />\n`
					gpx+=e`<type>${note.status}</type>\n`
					gpx+=`</wpt>\n`
				}
				gpx+=`</gpx>\n`
				const file=new File([gpx],'notes.gpx')
				const $a=document.createElement('a')
				$a.href=URL.createObjectURL(file)
				$a.download='notes.gpx'
				$a.click()
				URL.revokeObjectURL($a.href)
			})
			$commandGroup.append($exportNotesButton)
		}{
			const $commandGroup=makeCommandGroup(
				'yandex-panoramas',
				`Y.Panoramas`,
				'https://wiki.openstreetmap.org/wiki/RU:%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81.%D0%9F%D0%B0%D0%BD%D0%BE%D1%80%D0%B0%D0%BC%D1%8B',
				`Yandex.Panoramas (Яндекс.Панорамы)`
			)
			const $yandexPanoramasButton=document.createElement('button')
			$yandexPanoramasButton.append(`Open `,makeMapIcon('center'))
			$yandexPanoramasButton.addEventListener('click',()=>{
				const center=map.getCenter()
				const coords=center.lng+','+center.lat
				const url=`https://yandex.ru/maps/`+
					`?ll=`+encodeURIComponent(coords)+ // required if 'z' argument is present
					`&panorama%5Bpoint%5D=`+encodeURIComponent(coords)+
					`&z=`+encodeURIComponent(map.getZoom())
				open(url,'yandex')
			})
			$commandGroup.append($yandexPanoramasButton)
		}{
			const $commandGroup=makeCommandGroup(
				'mapillary',
				`Mapillary`,
				'https://wiki.openstreetmap.org/wiki/Mapillary'
			)
			const $mapillaryButton=document.createElement('button')
			$mapillaryButton.append(`Open `,makeMapIcon('center'))
			$mapillaryButton.addEventListener('click',()=>{
				const center=map.getCenter()
				const url=`https://www.mapillary.com/app/`+
					`?lat=`+encodeURIComponent(center.lat)+
					`&lng=`+encodeURIComponent(center.lng)+
					`&z=`+encodeURIComponent(map.getZoom())+
					`&focus=photo`
				open(url,'mapillary')
			})
			$commandGroup.append($mapillaryButton)
		}{
			const $commandGroup=makeCommandGroup('counts',`Note counts`)
			this.$fetchedNoteCount=document.createElement('span')
			this.$fetchedNoteCount.textContent='0'
			this.$visibleNoteCount=document.createElement('span')
			this.$visibleNoteCount.textContent='0'
			this.$checkedNoteCount=document.createElement('span')
			this.$checkedNoteCount.textContent='0'
			$commandGroup.append(
				this.$fetchedNoteCount,` fetched, `,
				this.$visibleNoteCount,` visible, `,
				this.$checkedNoteCount,` selected`
			)
		}{
			const $commandGroup=makeCommandGroup('legend',`Legend`)
			$commandGroup.append(makeMapIcon('center'),` = map center, `,makeMapIcon('area'),` = map area, `,makeNotesIcon('selected'),` = selected notes`)
		}
		function makeCommandGroup(name: string, title: string, linkHref?: string, linkTitle?: string): HTMLDetailsElement {
			const storageKey='commands-'+name
			const $commandGroup=document.createElement('details')
			$commandGroup.open=!!storage.getItem(storageKey)
			const $summary=document.createElement('summary')
			if (linkHref==null) {
				$summary.textContent=title
			} else {
				const $a=makeLink(title,linkHref,linkTitle)
				$a.target='_blank'
				$summary.append($a)
			}
			$commandGroup.append($summary)
			$commandGroup.addEventListener('toggle',()=>{
				if ($commandGroup.open) {
					storage.setItem(storageKey,'1')
				} else {
					storage.removeItem(storageKey)
				}
			})
			$container.append($commandGroup)
			return $commandGroup
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
	}
	receiveNoteCounts(nFetched: number, nVisible: number) {
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
