import {NoteMap} from './map'
import {makeLink, makeUserLink, makeDiv, makeElement, makeEscapeTag} from './util'

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

export default async function downloadAndShowElement(
	$a: HTMLAnchorElement, map: NoteMap, makeDate: (readableDate:string)=>HTMLElement,
	elementType: string, elementId: string
) {
	$a.classList.add('loading')
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
				const $popup=makeDiv('osm-element-popup-contents')(
					h(`Node: `,makeLink(getNodeName(element),e`https://www.openstreetmap.org/${elementType}/${elementId}`)),
					h(`Version #${element.version}`),
					p(
						`Edited on `,getElementDate(element,makeDate),
						` by `,getElementUser(element),
						` · Changeset #`,makeLink(String(element.changeset),e`https://www.openstreetmap.org/changeset/${element.changeset}`)
					)
				)
				if (element.tags) $popup.append(getElementTags(element.tags))
				return $popup
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
	} finally {
		$a.classList.remove('loading')
	}
}

function getNodeName(node: OsmNodeElement): string {
	if (node.tags?.name) {
		return `${node.tags.name} (${node.id})`
	} else {
		return String(node.id)
	}
}

function getElementDate(element: OsmElement, makeDate: (readableDate:string)=>HTMLElement): HTMLElement {
	const readableDate=element.timestamp.replace('T',' ').replace('Z','')
	return makeDate(readableDate)
}

function getElementUser(element: OsmElement): HTMLElement {
	return makeUserLink(element.uid,element.user)
}

function getElementTags(tags: {[key:string]:string}): HTMLElement {
	const tagBatchSize=10
	const tagList=Object.entries(tags)
	let i=0
	let $button: HTMLButtonElement|undefined
	const $figure=document.createElement('figure')
	const $figcaption=document.createElement('figcaption')
	$figcaption.textContent=`Tags`
	const $table=document.createElement('table')
	$figure.append($figcaption,$table)
	writeTagBatch()
	return $figure
	function writeTagBatch() {
		for (let j=0;i<tagList.length&&j<tagBatchSize;i++,j++) {
			const [k,v]=tagList[i]
			const $row=$table.insertRow()
			$row.insertCell().textContent=k
			$row.insertCell().textContent=v // TODO what if tag value too long?
		}
		if (i<tagList.length) {
			if (!$button) {
				$button=document.createElement('button')
				$figure.append($button)
				$button.onclick=writeTagBatch
			}
			const nTagsLeft=tagList.length-i
			const nTagsToShowNext=Math.min(nTagsLeft,tagBatchSize)
			$button.textContent=`Show ${nTagsToShowNext} / ${nTagsLeft} more tags`
		} else {
			$button?.remove()
		}
	}
}
