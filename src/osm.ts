import type Server from './server'
import {makeLink, makeElement} from './html'
import {makeEscapeTag} from './escape'

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
	server: Server,
	changesetId: string
): Promise<[
	geometry: L.Layer,
	popupContents: HTMLElement[]
]> {
	const response=await server.api.fetch(e`changeset/${changesetId}.json`)
	if (!response.ok) {
		if (response.status==404) {
			throw new TypeError(`changeset doesn't exist`)
		} else {
			throw new TypeError(`OSM API error: unsuccessful response`)
		}
	}
	const data=await response.json()
	const changeset=getChangesetFromOsmApiResponse(data)
	return [
		makeChangesetGeometry(changeset),
		makeChangesetPopupContents(server,changeset)
	]
	function makeChangesetGeometry(changeset: OsmChangeset): L.Layer {
		if (
			changeset.minlat==null || changeset.minlon==null ||
			changeset.maxlat==null || changeset.maxlon==null
		) {
			throw new TypeError(`changeset is empty`)
		}
		return L.rectangle([
			[changeset.minlat,changeset.minlon],
			[changeset.maxlat,changeset.maxlon]
		])
	}
}

export async function downloadAndShowElement(
	server: Server,
	elementType: OsmElement['type'], elementId: string
): Promise<[
	geometry: L.Layer,
	popupContents: HTMLElement[]
]> {
	const fullBit=(elementType=='node' ? '' : '/full')
	const response=await server.api.fetch(e`${elementType}/${elementId}`+`${fullBit}.json`)
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
		return [
			makeNodeGeometry(element),
			makeElementPopupContents(server,element)
		]
	} else if (isOsmWayElement(element)) {
		return [
			makeWayGeometry(element,elements),
			makeElementPopupContents(server,element)
		]
	} else if (isOsmRelationElement(element)) {
		return [
			makeRelationGeometry(element,elements),
			makeElementPopupContents(server,element)
		]
	} else {
		throw new TypeError(`OSM API error: requested element has unknown type`) // shouldn't happen
	}
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

function makeChangesetPopupContents(server: Server, changeset: OsmChangeset): HTMLElement[] {
	const contents: HTMLElement[] = []
	const p=(...s: Array<string|HTMLElement>)=>makeElement('p')()(...s)
	const h=(...s: Array<string|HTMLElement>)=>p(makeElement('strong')()(...s))
	const c=(...s: Array<string|HTMLElement>)=>p(makeElement('em')()(...s))
	const changesetHref=server.web.getUrl(e`changeset/${changeset.id}`)
	contents.push(
		h(`Changeset: `,makeLink(String(changeset.id),changesetHref))
	)
	if (changeset.tags?.comment) contents.push(
		c(changeset.tags.comment)
	)
	const $p=p()
	if (changeset.closed_at) {$p.append(
		`Closed on `,getDate(changeset.closed_at)
	)} else {$p.append(
		`Created on `,getDate(changeset.created_at)
	)}
	$p.append(
		` by `,getUser(server,changeset)
	)
	contents.push($p)
	const $tags=getTags(changeset.tags,'comment')
	if ($tags) contents.push($tags)
	return contents
}

function makeElementPopupContents(server: Server, element: OsmElement): HTMLElement[] {
	const p=(...s: Array<string|HTMLElement>)=>makeElement('p')()(...s)
	const h=(...s: Array<string|HTMLElement>)=>p(makeElement('strong')()(...s))
	const elementPath=e`${element.type}/${element.id}`
	const contents: HTMLElement[] = [
		h(capitalize(element.type)+`: `,makeLink(getElementName(element),server.web.getUrl(elementPath))),
		h(
			`Version #${element.version} · `,
			makeLink(`View History`,server.web.getUrl(elementPath+'/history')),` · `,
			makeLink(`Edit`,server.web.getUrl(e`edit?${element.type}=${element.id}`))
		),
		p(
			`Edited on `,getDate(element.timestamp),
			` by `,getUser(server,element),
			` · Changeset #`,getChangeset(server,element.changeset)
		)
	]
	const $tags=getTags(element.tags)
	if ($tags) contents.push($tags)
	return contents
}

function capitalize(s: string): string {
	return s[0].toUpperCase()+s.slice(1)
}

function getDate(timestamp: string): HTMLElement {
	const readableDate=timestamp.replace('T',' ').replace('Z','')
	const $time=document.createElement('time')
	$time.classList.add('listened')
	$time.textContent=readableDate
	$time.dateTime=timestamp
	return $time
}

function getUser(server: Server, data: OsmBase): HTMLElement {
	const $a=makeUserLink(server,data.uid,data.user)
	$a.classList.add('listened')
	$a.dataset.userName=data.user
	$a.dataset.userId=String(data.uid)
	return $a
}

function getChangeset(server: Server, changesetId: number): HTMLElement {
	const cid=String(changesetId)
	const $a=makeLink(cid,server.web.getUrl(e`changeset/${cid}`))
	$a.classList.add('listened')
	$a.dataset.changesetId=cid
	return $a
}

function getTags(tags: {[key:string]:string}|undefined, skipKey?: string): HTMLElement|null {
	if (!tags) return null
	const tagBatchSize=10
	const tagList=Object.entries(tags).filter(([k,v])=>k!=skipKey)
	if (tagList.length<=0) return null
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
			const $keyCell=$row.insertCell()
			$keyCell.textContent=k
			if (k.length>30) $keyCell.classList.add('long')
			$row.insertCell().textContent=v
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

function getElementName(element: OsmElement): string {
	if (element.tags?.name) {
		return `${element.tags.name} (${element.id})`
	} else {
		return String(element.id)
	}
}

function makeUserLink(server: Server, uid: number, username?: string): HTMLElement {
	if (username) return makeUserNameLink(server,username)
	return makeUserIdLink(server,uid)
}

function makeUserNameLink(server: Server, username: string): HTMLAnchorElement {
	const fromName=(name: string)=>server.web.getUrl(e`user/${name}`)
	return makeLink(username,fromName(username))
}

function makeUserIdLink(server: Server, uid: number): HTMLAnchorElement {
	const fromId=(id: number)=>server.api.getUrl(e`user/${id}`)
	return makeLink('#'+uid,fromId(uid))
}
