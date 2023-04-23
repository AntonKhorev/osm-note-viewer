import {OsmBaseApiData, isOsmBaseApiData} from './base'
import {isObject, isArray} from '../util/types'

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
	if (!('comments_count' in c) || typeof c.comments_count != 'number') return false
	if (!('changes_count' in c) || typeof c.changes_count != 'number') return false
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
	let changeset:unknown
	if ('changeset' in data) {
		changeset=data.changeset
	} else if ('elements' in data) {
		if (!isArray(data.elements)) throw new TypeError(`OSM API error: 'elements' is not an array in response data`)
		const changesetArray=data.elements
		if (changesetArray.length!=1) throw new TypeError(`OSM API error: invalid number of changesets in response data`)
		changeset=changesetArray[0]
	} else {
		throw new TypeError(`OSM API error: no 'changeset' or 'elements' in response data`)
	}
	changeset=fixBboxFormatDifferences(changeset)
	if (!isOsmChangesetApiData(changeset)) throw new TypeError(`OSM API error: invalid changeset in response data`)
	return changeset
}

export function getChangesetsFromOsmApiResponse(data: unknown): OsmChangesetApiData[] {
	if (!data || typeof data != 'object') throw new TypeError(`OSM API error: invalid response data`)
	if (!('changesets' in data) || !isArray(data.changesets)) throw new TypeError(`OSM API error: no changesets array in response data`)
	const changesetArray=data.changesets.map(fixBboxFormatDifferences)
	if (!changesetArray.every(isOsmChangesetApiData)) throw new TypeError(`OSM API error: invalid changeset in response data`)
	return changesetArray
}

function fixBboxFormatDifferences(inputChangeset: unknown): unknown {
	if (!isObject(inputChangeset)) return inputChangeset
	let changeset=inputChangeset
	if (('min_lat' in changeset) && !('minlat' in changeset)) { const {min_lat,...rest}=changeset; changeset={minlat:min_lat,...rest} }
	if (('min_lon' in changeset) && !('minlon' in changeset)) { const {min_lon,...rest}=changeset; changeset={minlon:min_lon,...rest} }
	if (('max_lat' in changeset) && !('maxlat' in changeset)) { const {max_lat,...rest}=changeset; changeset={maxlat:max_lat,...rest} }
	if (('max_lon' in changeset) && !('maxlon' in changeset)) { const {max_lon,...rest}=changeset; changeset={maxlon:max_lon,...rest} }
	return changeset
}
