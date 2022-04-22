import getCommentItems from './comment'
import {NoteMap} from './map'
import {makeLink, makeUserLink, makeDiv, makeElement, makeEscapeTag} from './util'

export default class NoteTableCommentWriter {
	wrappedOsmLinkClickListener:  (this: HTMLAnchorElement, ev: MouseEvent)=>void
	constructor(private $table: HTMLTableElement, map: NoteMap, pingNoteSection: ($noteSection: HTMLTableSectionElement)=>void) {
		this.wrappedOsmLinkClickListener=function(this: HTMLAnchorElement, ev: MouseEvent){
			const $a=this
			ev.preventDefault()
			ev.stopPropagation()
			if (handleNote($a.dataset.noteId)) return
			if (handleElement($a.dataset.elementType,$a.dataset.elementId)) return
			handleMap($a.dataset.zoom,$a.dataset.lat,$a.dataset.lon)
			function handleNote(noteId: string|undefined): boolean {
				if (!noteId) return false
				const $noteSection=document.getElementById(`note-`+noteId)
				if (!($noteSection instanceof HTMLTableSectionElement)) return false
				if ($noteSection.classList.contains('hidden')) return false
				pingNoteSection($noteSection)
				return true
			}
			function handleElement(elementType: string|undefined, elementId: string|undefined): boolean {
				if (!elementType || !elementId) return false
				downloadAndShowElement($a,map,elementType,elementId)
				return true
			}
			function handleMap(zoom: string|undefined, lat: string|undefined, lon: string|undefined): boolean {
				if (!(zoom && lat && lon)) return false
				map.panAndZoomTo([Number(lat),Number(lon)],Number(zoom))
				return true
			}
		}
	}
	writeCommentText($cell: HTMLElement, commentText: string, showImages: boolean): void {
		const result: Array<string|HTMLElement> = []
		const images: Array<HTMLAnchorElement> = []
		let iImage=0
		for (const item of getCommentItems(commentText)) {
			if (item.type=='link' && item.link=='image') {
				const $inlineLink=makeLink(item.href,item.href)
				$inlineLink.classList.add('image','inline')
				result.push($inlineLink)
				const $img=document.createElement('img')
				$img.loading='lazy' // this + display:none is not enough to surely stop the browser from accessing the image link
				if (showImages) $img.src=item.href // therefore only set the link if user agreed to loading
				$img.alt=`attached photo`
				$img.addEventListener('error',imageErrorHandler)
				const $floatLink=document.createElement('a')
				$floatLink.classList.add('image','float')
				$floatLink.href=item.href
				$floatLink.append($img)
				images.push($floatLink)
				if (!iImage) {
					$cell.addEventListener('mouseover',imageCommentHoverListener)
					$cell.addEventListener('mouseout',imageCommentHoverListener)
				}
				iImage++

			} else if (item.type=='link' && item.link=='osm') {
				const $a=makeLink(item.text,item.href)
				$a.classList.add('osm')
				if (item.map) [$a.dataset.zoom,$a.dataset.lat,$a.dataset.lon]=item.map
				if (item.osm=='note') {
					$a.classList.add('other-note')
					$a.dataset.noteId=String(item.id)
					// updateNoteLink($a) // handleNotesUpdate() is going to be run anyway
				}
				if (item.osm=='element') {
					$a.dataset.elementType=item.element
					$a.dataset.elementId=String(item.id)
				}
				$a.addEventListener('click',this.wrappedOsmLinkClickListener)
				result.push($a)
			} else {
				result.push(item.text)
			}
		}
		$cell.append(...images,...result)
	}
	handleShowImagesUpdate(showImages: boolean): void {
		for (const $a of this.$table.querySelectorAll('td.note-comment a.image.float')) {
			if (!($a instanceof HTMLAnchorElement)) continue
			const $img=$a.firstChild
			if (!($img instanceof HTMLImageElement)) continue
			if (showImages && !$img.src) $img.src=$a.href // don't remove src when showImages is disabled, otherwise will reload all images when src is set back
		}
	}
	handleNotesUpdate(): void {
		for (const $a of this.$table.querySelectorAll('td.note-comment a.other-note')) {
			if (!($a instanceof HTMLAnchorElement)) continue
			updateNoteLink($a)
		}
	}
}

export function makeDate(readableDate: string, fallbackDate: string): HTMLElement {
	const [readableDateWithoutTime]=readableDate.split(' ',1)
	if (readableDate && readableDateWithoutTime) {
		const $time=document.createElement('time')
		$time.textContent=readableDateWithoutTime
		$time.dateTime=`${readableDate}Z`
		$time.title=`${readableDate} UTC`
		return $time
	} else {
		const $unknownDateTime=document.createElement('span')
		$unknownDateTime.textContent=`?`
		$unknownDateTime.title=fallbackDate
		return $unknownDateTime
	}
}

function updateNoteLink($a: HTMLAnchorElement): void {
	const $noteSection=document.getElementById(`note-`+$a.dataset.noteId)
	if (!($noteSection instanceof HTMLTableSectionElement)) {
		$a.classList.add('absent')
		$a.title=`The note is not downloaded`
	} else if ($noteSection.classList.contains('hidden')) {
		$a.classList.add('absent')
		$a.title=`The note is filtered out`
	} else {
		$a.classList.remove('absent')
		$a.title=''
	}
}

function imageCommentHoverListener(this: HTMLElement, ev: MouseEvent): void {
	const $targetLink=getTargetLink()
	if (!$targetLink) return
	const $floats=this.querySelectorAll('a.image.float')
	const $inlines=this.querySelectorAll('a.image.inline')
	for (let i=0;i<$floats.length&&i<$inlines.length;i++) {
		if ($floats[i]==$targetLink) {
			modifyTwinLink($inlines[i])
			return
		}
		if ($inlines[i]==$targetLink) {
			modifyTwinLink($floats[i])
			return
		}
	}
	function getTargetLink() {
		if (ev.target instanceof HTMLAnchorElement) return ev.target
		if (!(ev.target instanceof HTMLElement)) return null
		return ev.target.closest('a')
	}
	function modifyTwinLink($a: Element) {
		$a.classList.toggle('active',ev.type=='mouseover')
	}
}

function imageErrorHandler(this: HTMLImageElement) {
	this.removeAttribute('alt') // render broken image icon
}

interface OsmElement { // visible osm element
	type: 'node'|'way'|'relation'
	id: number
	timestamp: string
	version: number
	changeset: number
	user?: string
	uid: number
	tags?: {[key:string]:string}
}

interface OsmNodeElement extends OsmElement {
	type: 'node'
	lat: number // must have lat and lon because visible
	lon: number
}

function isOsmElement(e: any): e is OsmElement {
	if (!e) return false
	if (e.type!='node' && e.type!='way' && e.type!='relation') return false
	if (!Number.isInteger(e.id)) return false
	if (typeof e.timestamp != 'string') return false
	if (!Number.isInteger(e.version)) return false
	if (!Number.isInteger(e.changeset)) return false
	if (e.user!=null && (typeof e.user != 'string')) return false
	if (!Number.isInteger(e.uid)) return false
	return true
}

function isOsmNodeElement(e: any): e is OsmNodeElement {
	if (e.type!='node') return false
	if (typeof e.lat != 'number') return false
	if (typeof e.lon != 'number') return false
	return isOsmElement(e)
}

async function downloadAndShowElement($a: HTMLAnchorElement, map: NoteMap, elementType: string, elementId: string) {
	try {
		// TODO cancel already running response
		const e=makeEscapeTag(encodeURIComponent)
		const url=e`https://api.openstreetmap.org/api/0.6/${elementType}/${elementId}.json`
		const response=await fetch(url)
		if (!response.ok) {
			if (response.status==404) {
				throw new TypeError(`element doesn't exist`)
			} else if (response.status==410) {
				throw new TypeError(`element was deleted`)
			} else {
				throw new TypeError(`OSM API error: unsuccessful response`)
			}
		}
		const data=await response.json()
		const element=data?.elements[0]
		if (!isOsmElement(element)) throw new TypeError(`OSM API error: invalid response data`)
		map.elementLayer.clearLayers()
		if (isOsmNodeElement(element)) {
			const elementGeometry=L.circleMarker([element.lat,element.lon])
			elementGeometry.bindPopup(()=>{
				const p=(...s: Array<string|HTMLElement>)=>makeElement('p')()(...s)
				const h=(...s: Array<string|HTMLElement>)=>p(makeElement('strong')()(...s))
				return makeDiv()(
					h(`Node: ${getNodeName(element)}`),
					h(`Version #${element.version}`),
					p(`Edited on `,getElementDate(element),` by `,getElementUser(element),` · Changeset #${element.changeset}`)
				)
				// TODO what if too many tags?
				// TODO what if tag value too long?
			})
			map.elementLayer.addLayer(elementGeometry)
			map.panTo([element.lat,element.lon])
		} else {
			console.log('fetched element',element)
		}
		$a.classList.remove('absent')
		$a.title=''
	} catch (ex) {
		map.elementLayer.clearLayers()
		$a.classList.add('absent')
		if (ex instanceof TypeError) {
			$a.title=ex.message
		} else {
			$a.title=`unknown error ${ex}`
		}
	}
}

function getNodeName(node: OsmNodeElement): string {
	if (node.tags?.name) {
		return `${node.tags.name} (${node.id})`
	} else {
		return String(node.id)
	}
}

function getElementDate(element: OsmElement): HTMLElement {
	const readableDate=element.timestamp.replace('T',' ').replace('Z','')
	return makeDate(readableDate,element.timestamp)
}

function getElementUser(element: OsmElement): HTMLElement {
	return makeUserLink(element.uid,element.user)
}
