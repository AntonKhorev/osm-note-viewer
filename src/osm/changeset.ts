import {OsmBaseApiData, isOsmBaseApiData} from './base'
import {isArray} from '../util/types'

export type OsmChangesetApiData = OsmBaseApiData & {
	created_at: string
	closed_at?: string
	comments_count: number
	changes_count: number
}

export type OsmChangesetWithBboxApiData = OsmChangesetApiData & {
	minlat: number
	minlon: number
	maxlat: number
	maxlon: number
}

function isOsmChangesetApiData(c: unknown): c is OsmChangesetApiData {
	if (!isOsmBaseApiData(c)) return false
	if (!('created_at' in c) || typeof c.created_at != 'string') return false
	if (('closed_at' in c) && typeof c.closed_at != 'string') return false
	return true
}

export function hasBbox(c: OsmChangesetApiData): c is OsmChangesetWithBboxApiData {
	if (!('minlat' in c) || !Number.isFinite(c.minlat)) return false
	if (!('maxlat' in c) || !Number.isFinite(c.maxlat)) return false
	if (!('minlon' in c) || !Number.isFinite(c.minlon)) return false
	if (!('maxlon' in c) || !Number.isFinite(c.maxlon)) return false
	return true
}

export function getChangesetFromOsmApiResponse(data: unknown): OsmChangesetApiData {
	if (!data || typeof data != 'object') throw new TypeError(`OSM API error: invalid response data`)
	if (!('elements' in data) || !isArray(data.elements)) throw new TypeError(`OSM API error: no 'elements' array with changesets in response data`)
	const changesetArray=data.elements
	if (changesetArray.length!=1) throw new TypeError(`OSM API error: invalid number of changesets in response data`)
	const changeset=changesetArray[0]
	if (!isOsmChangesetApiData(changeset)) throw new TypeError(`OSM API error: invalid changeset in response data`)
	return changeset
}

export function getChangesetsFromOsmApiResponse(data: unknown): OsmChangesetApiData[] {
	if (!data || typeof data != 'object') throw new TypeError(`OSM API error: invalid response data`)
	if (!('changesets' in data) || !isArray(data.changesets)) throw new TypeError(`OSM API error: no changesets array in response data`)
	const changesetArray=data.changesets
	if (!changesetArray.every(isOsmChangesetApiData)) throw new TypeError(`OSM API error: invalid changeset in response data`)
	return changesetArray
}
