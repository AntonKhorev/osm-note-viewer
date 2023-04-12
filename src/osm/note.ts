import {isObject, isArray, isArrayOfNumbers} from '../util/types'

export type OsmNoteCommentApiData = {
	date: string
	uid?: number
	user?: string
	action: 'opened' | 'closed' | 'reopened' | 'commented' | 'hidden'
	text?: string
}

export type OsmNoteApiData = {
	// type: "Feature"
	geometry: {
		coordinates: [lon: number, lat: number]
	}
	properties: {
		id: number
		date_created: string
		status: 'open' | 'closed' | 'hidden'
		// closed_at?
		comments: OsmNoteCommentApiData[]
	}
}

function isOsmNoteApiData(n: unknown): n is OsmNoteApiData {
	if (!isObject(n)) return false
	// if (!('type' in n) || n.type!='Feature') return false
	if (!('geometry' in n) || !isObject(n.geometry)) return false
	if (!('coordinates' in n.geometry) || !isArrayOfNumbers(n.geometry.coordinates) || n.geometry.coordinates.length<2) return false
	if (!('properties' in n) || !isObject(n.properties)) return false
	if (!('id' in n.properties) || !Number.isInteger(n.properties.id)) return false
	if (!('date_created' in n.properties) || typeof n.properties.date_created != 'string') return false
	if (!('status' in n.properties) || typeof n.properties.status != 'string') return false
	if (!('comments' in n.properties) || !isArray(n.properties.comments)) return false
	if (!n.properties.comments.every(c=>(
		isObject(c) &&
		'date' in c && typeof c.date == 'string' &&
		(!('uid' in c) || Number.isInteger(c.uid)) &&
		(!('user' in c) || typeof c.user == 'string') &&
		'action' in c && typeof c.action =='string' &&
		(!('text' in c) || typeof c.text =='string')
	))) return false
	return true
}

export function getNotesFromOsmApiResponse(data: unknown): OsmNoteApiData[] {
	if (!isObject(data)) throw new TypeError(`OSM API error: invalid response data`)
	if (!('features' in data) || !isArray(data.features)) throw new TypeError(`OSM API error: no features array in response data`)
	const noteArray=data.features
	if (!noteArray.every(isOsmNoteApiData)) throw new TypeError(`OSM API error: invalid note feature in response data`)
	return noteArray
}

export function getNoteFromOsmApiResponse(data: unknown): OsmNoteApiData {
	if (!isOsmNoteApiData(data)) throw new TypeError(`OSM API error: invalid note feature in response data`)
	return data
}
