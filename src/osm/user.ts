import {isObject, isArrayOfStrings} from '../util/types'

type Counter = {
	count: number
}

function isCounter(c: unknown): c is Counter {
	return isObject(c) && 'count' in c && Number.isInteger(c.count)
}

type ActiveCounter = Counter & {
	active: number
}

function isActiveCounter(c: unknown): c is ActiveCounter {
	return isCounter(c) && 'active' in c && Number.isInteger(c.active)
}

export type OsmUserApiData = {
	id: number
	display_name: string
	account_created: string
	description?: string
	contributor_terms: {
		agreed: boolean
	}
	img?: {
		href: string
	}
	roles: string[]
	changesets: Counter
	traces: Counter
	blocks: {
		received: ActiveCounter
		issued?: ActiveCounter
	}
}

function isOsmUserApiData(u: unknown): u is OsmUserApiData {
	if (!isObject(u)) return false
	if (!('id' in u) || !Number.isInteger(u.id)) return false
	if (!('display_name' in u) || typeof u.display_name != 'string') return false
	if (!('account_created' in u) || typeof u.account_created != 'string') return false
	if (('description' in u) && typeof u.description != 'string') return false
	if (!('contributor_terms' in u) || !isObject(u.contributor_terms) || !('agreed' in u.contributor_terms) || typeof u.contributor_terms.agreed != 'boolean') return false
	if (('img' in u) && (!isObject(u.img) || !('href' in u.img) || typeof u.img.href != 'string')) return false
	if (!('roles' in u) || !isArrayOfStrings(u.roles)) return false
	if (!('changesets' in u) || !isCounter(u.changesets)) return false
	if (!('traces' in u) || !isCounter(u.traces)) return false
	if (!('blocks' in u) || !isObject(u.blocks)) return false
	if (!('received' in u.blocks) || !isActiveCounter(u.blocks.received)) return false
	if (('issued' in u.blocks) && !isActiveCounter(u.blocks.issued)) return false
	return true
}

export function getUserFromOsmApiResponse(data: unknown): OsmUserApiData {
	if (!isObject(data)) throw new TypeError(`OSM API error: invalid response data`)
	if (!('user' in data)) throw new TypeError(`OSM API error: no user in response data`)
	if (!isOsmUserApiData(data.user)) throw new TypeError(`OSM API error: invalid user in response data`)
	return data.user
}
