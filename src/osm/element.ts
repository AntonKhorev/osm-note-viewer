import {OsmBaseApiData, isOsmBaseApiData} from './base'
import {isArray} from '../util/types'

export type OsmElementBaseApiData = OsmBaseApiData & { // visible osm element
	type: 'node'|'way'|'relation'
	timestamp: string
	version: number
	changeset: number
}

export type OsmVisibleNodeApiData = OsmElementBaseApiData & {
	type: 'node'
	lat: number
	lon: number
}

export type OsmVisibleWayApiData = OsmElementBaseApiData & {
	type: 'way'
	nodes: number[]
}

export type OsmVisibleRelationApiData = OsmElementBaseApiData & {
	type: 'relation'
	members: {
		type: OsmVisibleElementApiData['type'],
		ref: number,
		role: string
	}[]
}

export type OsmVisibleElementApiData = OsmVisibleNodeApiData | OsmVisibleWayApiData | OsmVisibleRelationApiData

export type OsmVisibleElementApiDataMap = {
	node: {[id:string]: OsmVisibleNodeApiData},
	way: {[id:string]: OsmVisibleWayApiData},
	relation: {[id:string]: OsmVisibleRelationApiData}
}

function isOsmElementBaseApiData(e: unknown): e is OsmElementBaseApiData {
	if (!isOsmBaseApiData(e)) return false
	if (!('type' in e) || (e.type!='node' && e.type!='way' && e.type!='relation')) return false
	if (!('timestamp' in e) || typeof e.timestamp != 'string') return false
	if (!('version' in e) || !Number.isInteger(e.version)) return false
	if (!('changeset' in e) || !Number.isInteger(e.changeset)) return false
	return true
}

function isOsmVisibleNodeApiData(e: unknown): e is OsmVisibleNodeApiData {
	if (!isOsmElementBaseApiData(e)) return false
	if (e.type!='node') return false
	if (!('lat' in e) || typeof e.lat != 'number') return false
	if (!('lon' in e) || typeof e.lon != 'number') return false
	return true
}

function isOsmVisibleWayApiData(e: unknown): e is OsmVisibleWayApiData {
	if (!isOsmElementBaseApiData(e)) return false
	if (e.type!='way') return false
	if (!('nodes' in e) || !isArray(e.nodes)) return false
	if (!e.nodes.every(v=>Number.isInteger(v))) return false
	return true
}

function isOsmVisibleRelationApiData(e: unknown): e is OsmVisibleRelationApiData {
	if (!isOsmElementBaseApiData(e)) return false
	if (e.type!='relation') return false
	if (!('members' in e) || !isArray(e.members)) return false
	if (!e.members.every(m=>(
		m && typeof m == 'object' &&
		'type' in m && (m.type=='node' || m.type=='way' || m.type=='relation') &&
		'ref' in m && Number.isInteger(m.ref) &&
		'role' in m && typeof m.role == 'string'
	))) return false
	return true
}

export function getElementsFromOsmApiResponse(data: unknown): OsmVisibleElementApiDataMap {
	const node: {[id:string]: OsmVisibleNodeApiData} = {}
	const way: {[id:string]: OsmVisibleWayApiData} = {}
	const relation: {[id:string]: OsmVisibleRelationApiData} = {}
	if (!data || typeof data != 'object') throw new TypeError(`OSM API error: invalid response data`)
	if (!('elements' in data) || !isArray(data.elements)) throw new TypeError(`OSM API error: no elements array in response data`)
	const elementArray=data.elements
	for (const element of elementArray) {
		if (isOsmVisibleNodeApiData(element)) {
			node[element.id]=element
		} else if (isOsmVisibleWayApiData(element)) {
			way[element.id]=element
		} else if (isOsmVisibleRelationApiData(element)) {
			relation[element.id]=element
		} else {
			throw new TypeError(`OSM API error: invalid element in response data`)
		}
	}
	return {node,way,relation}
}
