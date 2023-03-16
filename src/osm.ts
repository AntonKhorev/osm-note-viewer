export type OsmBase = {
	id: number
	user?: string
	uid: number
	tags?: {[key:string]:string}
}

type OsmElementBase = OsmBase & { // visible osm element
	timestamp: string
	version: number
	changeset: number
}

export type OsmNodeElement = OsmElementBase & {
	type: 'node'
	lat: number // must have lat and lon because visible
	lon: number
}

export type OsmWayElement = OsmElementBase & {
	type: 'way'
	nodes: number[]
}

export type OsmRelationElement = OsmElementBase & {
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

export type OsmChangeset = OsmBase & {
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

export interface OsmChangesetWithBbox extends OsmChangeset {
	minlat: number
	minlon: number
	maxlat: number
	maxlon: number
}

export function hasBbox(changeset: OsmChangeset): changeset is OsmChangesetWithBbox {
	return (
		changeset.minlat!=null && changeset.minlon!=null &&
		changeset.maxlat!=null && changeset.maxlon!=null
	)
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

export type OsmAdiffNodeElement = OsmElementBase & {
	type: 'node'
} & ({
	visible: false
}|{
	visible: true
	lat: number
	lon: number
})

type OsmAdiffWayNodeRef = [ref:number,lat:number,lon:number]

export type OsmAdiffWayElement = OsmElementBase & {
	type: 'way'
} & ({
	visible: false
}|{
	visible: true
	nodeRefs: OsmAdiffWayNodeRef[]
})

export type OsmAdiffElement = OsmAdiffNodeElement | OsmAdiffWayElement

export type OsmAdiffAction<T> = {
	action: 'create'
	newElement: T
} | {
	action: 'modify'
	oldElement: T
	newElement: T
} | {
	action: 'delete'
	oldElement: T
}

export type OsmAdiff = {
	node: {[id:string]: OsmAdiffAction<OsmAdiffNodeElement>},
	way: {[id:string]: OsmAdiffAction<OsmAdiffWayElement>},
}

export function getAdiffFromDocument(changeset: OsmChangeset, doc: Document): OsmAdiff {
	const node: {[id:number]: OsmAdiffAction<OsmAdiffNodeElement>} = {}
	const way: {[id:number]: OsmAdiffAction<OsmAdiffWayElement>} = {}
	const changedNodeIds=new Set<number>()
	for (const actionDocElement of doc.querySelectorAll('action')) {
		const actionType=actionDocElement.getAttribute('type')
		if (actionType=='create') {
			const element=doesElementMatchChangeset(changeset,changedNodeIds,actionDocElement)
			if (element) {
				if (element.type=='node') {
					node[element.id]={
						action: actionType,
						newElement: element
					}
				} else if (element.type=='way') {
					way[element.id]={
						action: actionType,
						newElement: element
					}
				}
			}
		} else if (actionType=='modify') {
			const elements=doesNewElementMatchChangeset(changeset,changedNodeIds,actionDocElement)
			if (elements) {
				const [oldElement,newElement]=elements
				if (oldElement.type=='node' && newElement.type=='node') {
					node[newElement.id]={
						action: actionType,
						oldElement,newElement
					}
				} else if (oldElement.type=='way' && newElement.type=='way') {
					way[newElement.id]={
						action: actionType,
						oldElement,newElement
					}
				}
			}
		} else if (actionType=='delete') {
			const elements=doesNewElementMatchChangeset(changeset,changedNodeIds,actionDocElement)
			if (elements) {
				const [oldElement,newElement]=elements
				if (oldElement.type=='node' && newElement.type=='node') {
					node[newElement.id]={
						action: actionType,
						oldElement
					}
				} else if (oldElement.type=='way' && newElement.type=='way') {
					way[newElement.id]={
						action: actionType,
						oldElement
					}
				}
			}
		}
	}
	return {node,way}
}
function doesElementMatchChangeset(
	changeset: OsmChangeset, changedNodeIds: Set<number>, parent: Element
): null | OsmAdiffElement {
	const docElement=parent.firstElementChild
	if (!docElement) throw new TypeError(`Overpass error: missing element`)
	const element=readAdiffElement(docElement)
	if (!isElementMatchesChangeset(changeset,changedNodeIds,element)) return null
	return element
}
function doesNewElementMatchChangeset(
	changeset: OsmChangeset, changedNodeIds: Set<number>, parent: Element
): null | [OsmAdiffNodeElement,OsmAdiffNodeElement] | [OsmAdiffWayElement,OsmAdiffWayElement] {
	const [oldChild,newChild]=getOldAndNewChildren(parent)
	if (!oldChild || !newChild) throw new TypeError(`Overpass error: missing element`)
	const oldDocElement=oldChild.firstElementChild
	const newDocElement=newChild.firstElementChild
	if (!oldDocElement || !newDocElement) throw new TypeError(`Overpass error: missing element`)
	const oldElement=readAdiffElement(oldDocElement)
	const newElement=readAdiffElement(newDocElement)
	if (!isElementMatchesChangeset(changeset,changedNodeIds,newElement)) return null
	if (oldElement.type=='node' && newElement.type=='node') {
		return [oldElement,newElement]
	} else if (oldElement.type=='way' && newElement.type=='way') {
		return [oldElement,newElement]
	} else {
		throw new TypeError(`Overpass error: unexpected element type change`)
	}
}
function getOldAndNewChildren(parent: Element): [oldChild: Element|undefined, newChild: Element|undefined] {
	let oldChild: Element|undefined
	let newChild: Element|undefined
	for (const oldOrNewChild of parent.children) {
		if (oldOrNewChild.tagName=='old') {
			oldChild=oldOrNewChild
		} else if (oldOrNewChild.tagName=='new') {
			newChild=oldOrNewChild
		}
	}
	return [oldChild,newChild]
}
function isElementMatchesChangeset(changeset: OsmChangeset, changedNodeIds: Set<number>, element: OsmAdiffElement): boolean {
	const changesetIdMatched=element.changeset==changeset.id
	if (element.type=='node') {
		if (changesetIdMatched) {
			changedNodeIds.add(element.id)
		}
	} else if (element.type=='way' && element.visible) {
		if (!changesetIdMatched) {
			for (const [ref] of element.nodeRefs) {
				if (changedNodeIds.has(ref)) return true
			}
		}
	}
	return changesetIdMatched
}
function readAdiffElement(docElement: Element): OsmAdiffElement {
	const readAttribute=(k:string,e=docElement)=>{
		const v=e.getAttribute(k)
		if (v==null) throw new TypeError(`Overpass error: missing element ${k}`)
		return v
	}
	const readNumberAttribute=(k:string,e=docElement)=>{
		const v=Number(readAttribute(k,e))
		if (isNaN(v)) throw new TypeError(`Overpass error: invalid element ${k}`)
		return v
	}
	const id=readNumberAttribute('id')
	const version=readNumberAttribute('version')
	const timestamp=readAttribute('timestamp')
	const changeset=readNumberAttribute('changeset')
	const uid=readNumberAttribute('uid')
	const user=readAttribute('user')
	const type=docElement.tagName
	const visible=docElement.getAttribute('visible')!='false'
	if (!visible) {
		if (type=='node' || type=='way') {
			return {
				type,id,version,timestamp,changeset,uid,user,visible
			}
		}
	} else {
		if (type=='node') {
			const lat=readNumberAttribute('lat')
			const lon=readNumberAttribute('lon')
			return {
				type,id,version,timestamp,changeset,uid,user,visible,
				lat,lon
			}
		} else if (type=='way') {
			const nodeRefs: OsmAdiffWayNodeRef[] = []
			for (const nodeRefDocElement of docElement.querySelectorAll('nd')) {
				const ref=readNumberAttribute('ref',nodeRefDocElement)
				const lat=readNumberAttribute('lat',nodeRefDocElement)
				const lon=readNumberAttribute('lon',nodeRefDocElement)
				nodeRefs.push([ref,lat,lon])
			}
			return {
				type,id,version,timestamp,changeset,uid,user,visible,
				nodeRefs
			}
		}
	}
	throw new TypeError(`Overpass error: unexpected element type "${docElement.tagName}"`)
}
