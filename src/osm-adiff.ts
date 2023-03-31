import type {OsmElementBaseApiData, OsmChangesetApiData} from './osm'

export type OsmAdiffNodeElement = OsmElementBaseApiData & {
	type: 'node'
} & ({
	visible: false
}|{
	visible: true
	lat: number
	lon: number
})

type OsmAdiffWayNodeRef = [ref:number,lat:number,lon:number]

export type OsmAdiffWayElement = OsmElementBaseApiData & {
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
	newElement: T
}

export type OsmAdiff = {
	node: {[id:string]: OsmAdiffAction<OsmAdiffNodeElement>},
	way: {[id:string]: OsmAdiffAction<OsmAdiffWayElement>},
}

export function getAdiffFromDocument(changeset: OsmChangesetApiData, doc: Document): OsmAdiff {
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
						oldElement,newElement
					}
				} else if (oldElement.type=='way' && newElement.type=='way') {
					way[newElement.id]={
						action: actionType,
						oldElement,newElement
					}
				}
			}
		}
	}
	return {node,way}
}
function doesElementMatchChangeset(
	changeset: OsmChangesetApiData, changedNodeIds: Set<number>, parent: Element
): null | OsmAdiffElement {
	const docElement=parent.firstElementChild
	if (!docElement) throw new TypeError(`Overpass error: missing element`)
	const element=readAdiffElement(docElement)
	if (!isElementMatchesChangeset(changeset,changedNodeIds,element)) return null
	return element
}
function doesNewElementMatchChangeset(
	changeset: OsmChangesetApiData, changedNodeIds: Set<number>, parent: Element
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
function isElementMatchesChangeset(changeset: OsmChangesetApiData, changedNodeIds: Set<number>, element: OsmAdiffElement): boolean {
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
		let tags: {[key:string]:string}|undefined
		for (const tagDocElement of docElement.querySelectorAll('tag')) {
			if (!tags) tags={}
			const k=readAttribute('k',tagDocElement)
			const v=readAttribute('v',tagDocElement)
			tags[k]=v
		}
		if (type=='node') {
			const lat=readNumberAttribute('lat')
			const lon=readNumberAttribute('lon')
			return {
				type,id,version,timestamp,changeset,uid,user,visible,tags,
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
				type,id,version,timestamp,changeset,uid,user,visible,tags,
				nodeRefs
			}
		}
	}
	throw new TypeError(`Overpass error: unexpected element type "${docElement.tagName}"`)
}
