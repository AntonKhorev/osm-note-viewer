export interface OsmBase {
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

export interface OsmNodeElement extends OsmElementBase {
	type: 'node'
	lat: number // must have lat and lon because visible
	lon: number
}

export interface OsmWayElement extends OsmElementBase {
	type: 'way'
	nodes: number[]
}

export interface OsmRelationElement extends OsmElementBase {
	type: 'relation'
	members: {
		type: OsmElement['type'],
		ref: number,
		role: string
	}[]
}

export type OsmElement = OsmNodeElement | OsmWayElement | OsmRelationElement

export type OsmElementMap = {
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

export interface OsmChangeset extends OsmBase {
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

export function getChangesetFromOsmApiResponse(data: any): OsmChangeset {
	if (!data) throw new TypeError(`OSM API error: invalid response data`)
	const changesetArray=data.elements
	if (!Array.isArray(changesetArray)) throw new TypeError(`OSM API error: invalid response data`)
	if (changesetArray.length!=1) throw new TypeError(`OSM API error: invalid number of changesets in response data`)
	const changeset=changesetArray[0]
	if (!isOsmChangeset(changeset)) throw new TypeError(`OSM API error: invalid changeset in response data`)
	return changeset
}

export function getChangesetsFromOsmApiResponse(data: any): OsmChangeset[] {
	if (!data) throw new TypeError(`OSM API error: invalid response data`)
	const changesetArray=data.changesets
	if (!Array.isArray(changesetArray)) throw new TypeError(`OSM API error: invalid response data`)
	if (!changesetArray.every(isOsmChangeset)) throw new TypeError(`OSM API error: invalid changeset in response data`)
	return changesetArray
}

export function getElementsFromOsmApiResponse(data: any): OsmElementMap {
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
