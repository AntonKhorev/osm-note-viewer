export type OsmBaseApiData = {
	id: number
	user?: string
	uid: number
	tags?: {[key:string]:string}
}

export function isOsmBaseApiData(d: unknown): d is OsmBaseApiData {
	if (!d || typeof d != 'object') return false
	if (!('id' in d) || !Number.isInteger(d.id)) return false
	if (('user' in d) && (typeof d.user != 'string')) return false
	if (!('uid' in d) || !Number.isInteger(d.uid)) return false
	if (('tags' in d) && (typeof d.tags != 'object')) return false
	return true
}
