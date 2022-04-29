import {NoteMap} from './map'
import {makeLink, makeUserLink, makeDiv, makeElement, makeEscapeTag} from './util'

interface OsmBase {
	id: number
	user?: string
	uid: number
	tags?: {[key:string]:string}
}

interface OsmElementBase extends OsmBase { // visible osm element
	timestamp: string
	version: number
	changeset: number
}

interface OsmNodeElement extends OsmElementBase {
	type: 'node'
	lat: number // must have lat and lon because visible
	lon: number
}

interface OsmWayElement extends OsmElementBase {
	type: 'way'
	nodes: number[]
}

interface OsmRelationElement extends OsmElementBase {
	type: 'relation'
	members: {
		type: OsmElement['type'],
		ref: number,
		role: string
	}[]
}

type OsmElement = OsmNodeElement | OsmWayElement | OsmRelationElement

type OsmElementMap = {
	node: {[id:string]: OsmNodeElement},
	way: {[id:string]: OsmWayElement},
	relation: {[id:string]: OsmRelationElement}
}

function isOsmBase(d: any): boolean {
	if (!d) return false
	if (!Number.isInteger(d.id)) return false
	if (d.user!=null && (typeof d.user != 'string')) return false
	if (!Number.isInteger(d.uid)) return false
	if (d.tags!=null && (typeof d.tags != 'object')) return false
	return true
}

function isOsmElementBase(e: any): boolean {
	if (!isOsmBase(e)) return false
	if (e.type!='node' && e.type!='way' && e.type!='relation') return false
	if (typeof e.timestamp != 'string') return false
	if (!Number.isInteger(e.version)) return false
	if (!Number.isInteger(e.changeset)) return false
	return true
}

function isOsmNodeElement(e: any): e is OsmNodeElement {
	if (!isOsmElementBase(e)) return false
	if (e.type!='node') return false
	if (typeof e.lat != 'number') return false
	if (typeof e.lon != 'number') return false
	return true
}

function isOsmWayElement(e: any): e is OsmWayElement {
	if (!isOsmElementBase(e)) return false
	if (e.type!='way') return false
	const nodes=e.nodes
	if (!Array.isArray(nodes)) return false
	if (!nodes.every(v=>Number.isInteger(v))) return false
	return true
}

function isOsmRelationElement(e: any): e is OsmRelationElement {
	if (!isOsmElementBase(e)) return false
	if (e.type!='relation') return false
	const members=e.members
	if (!Array.isArray(members)) return false
	if (!members.every(m=>(
		m &&
		(m.type=='node' || m.type=='way' || m.type=='relation') &&
		Number.isInteger(m.ref) &&
		(typeof m.role == 'string')
	))) return false
	return true
}

interface OsmChangeset extends OsmBase {
	created_at: string
	closed_at?: string
	minlat?: number
	minlon?: number
	maxlat?: number
	maxlon?: number
}


function isOsmChangeset(c: any): c is OsmChangeset {
	if (!isOsmBase(c)) return false
	if (typeof c.created_at != 'string') return false
	if (c.closed_at!=null && (typeof c.closed_at != 'string')) return false
	if (
		c.minlat==null && c.minlon==null &&
		c.maxlat==null && c.maxlon==null
	) {
		return true
	} else if (
		Number.isFinite(c.minlat) && Number.isFinite(c.minlon) &&
		Number.isFinite(c.maxlat) && Number.isFinite(c.maxlon)
	) {
		return true
	} else {
		return false
	}
}

const e=makeEscapeTag(encodeURIComponent)

export async function downloadAndShowChangeset(
	$a: HTMLAnchorElement, map: NoteMap, outputDate: (readableDate:string)=>HTMLElement,
	changesetId: string
): Promise<void> {
	downloadCommon($a,map,async()=>{
		const url=e`https://api.openstreetmap.org/api/0.6/changeset/${changesetId}.json`
		const response=await fetch(url)
		if (!response.ok) {
			if (response.status==404) {
				throw new TypeError(`changeset doesn't exist`)
			} else {
				throw new TypeError(`OSM API error: unsuccessful response`)
			}
		}
		const data=await response.json()
		const changeset=getChangesetFromOsmApiResponse(data)
		console.log(changeset)
	})
}

export async function downloadAndShowElement(
	$a: HTMLAnchorElement, map: NoteMap, outputDate: (readableDate:string)=>HTMLElement,
	elementType: OsmElement['type'], elementId: string
): Promise<void> {
	downloadCommon($a,map,async()=>{
		const fullBit=(elementType=='node' ? '' : '/full')
		const url=e`https://api.openstreetmap.org/api/0.6/${elementType}/${elementId}`+`${fullBit}.json`
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
		const elements=getElementsFromOsmApiResponse(data)
		const element=elements[elementType][elementId]
		if (!element) throw new TypeError(`OSM API error: requested element not found in response data`)
		if (isOsmNodeElement(element)) {
			addElementGeometryToMap(map,outputDate,element,
				makeNodeGeometry(element)
			)
		} else if (isOsmWayElement(element)) {
			addElementGeometryToMap(map,outputDate,element,
				makeWayGeometry(element,elements)
			)
		} else if (isOsmRelationElement(element)) {
			addElementGeometryToMap(map,outputDate,element,
				makeRelationGeometry(element,elements)
			)
		} else {
			throw new TypeError(`OSM API error: requested element has unknown type`) // shouldn't happen
		}
	})
	function makeNodeGeometry(node: OsmNodeElement): L.Layer {
		return L.circleMarker([node.lat,node.lon])
	}
	function makeWayGeometry(way: OsmWayElement, elements: OsmElementMap): L.Layer {
		const coords: L.LatLngExpression[] = []
		for (const id of way.nodes) {
			const node=elements.node[id]
			if (!node) throw new TypeError(`OSM API error: referenced element not found in response data`)
			coords.push([node.lat,node.lon])
		}
		return L.polyline(coords)
	}
	function makeRelationGeometry(relation: OsmRelationElement, elements: OsmElementMap): L.Layer {
		const geometry=L.featureGroup()
		for (const member of relation.members) {
			if (member.type=='node') {
				const node=elements.node[member.ref]
				if (!node) throw new TypeError(`OSM API error: referenced element not found in response data`)
				geometry.addLayer(makeNodeGeometry(node))
			} else if (member.type=='way') {
				const way=elements.way[member.ref]
				if (!way) throw new TypeError(`OSM API error: referenced element not found in response data`)
				geometry.addLayer(makeWayGeometry(way,elements))
			}
			// TODO indicate that there might be relations, their data may be incomplete
		}
		return geometry
	}
}

async function downloadCommon($a: HTMLAnchorElement, map: NoteMap, downloadSpecific: ()=>Promise<void>): Promise<void> {
	$a.classList.add('loading')
	try {
		// TODO cancel already running response
		await downloadSpecific()
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

function getChangesetFromOsmApiResponse(data: any): OsmChangeset {
	if (!data) throw new TypeError(`OSM API error: invalid response data`)
	const changesetArray=data.elements
	if (!Array.isArray(changesetArray)) throw new TypeError(`OSM API error: invalid response data`)
	if (changesetArray.length!=1) throw new TypeError(`OSM API error: invalid response data`)
	const changeset=changesetArray[0]
	if (!isOsmChangeset(changeset)) throw new TypeError(`OSM API error: invalid changeset in response data`)
	return changeset
}

function getElementsFromOsmApiResponse(data: any): OsmElementMap {
	const node: {[id:string]: OsmNodeElement} = {}
	const way: {[id:string]: OsmWayElement} = {}
	const relation: {[id:string]: OsmRelationElement} = {}
	if (!data) throw new TypeError(`OSM API error: invalid response data`)
	const elementArray=data.elements
	if (!Array.isArray(elementArray)) throw new TypeError(`OSM API error: invalid response data`)
	for (const element of elementArray) {
		if (isOsmNodeElement(element)) {
			node[element.id]=element
		} else if (isOsmWayElement(element)) {
			way[element.id]=element
		} else if (isOsmRelationElement(element)) {
			relation[element.id]=element
		} else {
			throw new TypeError(`OSM API error: invalid element in response data`)
		}
	}
	return {node,way,relation}
}

function addElementGeometryToMap(map: NoteMap, outputDate: (readableDate:string)=>HTMLElement, element: OsmElement, elementGeometry: L.Layer) {
	const popupWriter=()=>{
		const p=(...s: Array<string|HTMLElement>)=>makeElement('p')()(...s)
		const h=(...s: Array<string|HTMLElement>)=>p(makeElement('strong')()(...s))
		const elementHref=e`https://www.openstreetmap.org/${element.type}/${element.id}`
		const $popup=makeDiv('osm-element-popup-contents')(
			h(capitalize(element.type)+`: `,makeLink(getElementName(element),elementHref)),
			h(
				`Version #${element.version} · `,
				makeLink(`View History`,elementHref+'/history'),` · `,
				makeLink(`Edit`,e`https://www.openstreetmap.org/edit?${element.type}=${element.id}`)
			),
			p(
				`Edited on `,getElementDate(element,outputDate),
				` by `,getElementUser(element),
				` · Changeset #`,makeLink(String(element.changeset),e`https://www.openstreetmap.org/changeset/${element.changeset}`)
			)
		)
		if (element.tags) $popup.append(getElementTags(element.tags))
		return $popup
	}
	map.addOsmElement(elementGeometry,popupWriter)
}

function capitalize(s: string): string {
	return s[0].toUpperCase()+s.slice(1)
}

function getElementName(element: OsmElement): string {
	if (element.tags?.name) {
		return `${element.tags.name} (${element.id})`
	} else {
		return String(element.id)
	}
}

function getElementDate(element: OsmElement, outputDate: (readableDate:string)=>HTMLElement): HTMLElement {
	const readableDate=element.timestamp.replace('T',' ').replace('Z','') // TODO replace date output fn with active element fn
	return outputDate(readableDate)
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
