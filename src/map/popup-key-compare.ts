/**
 * Common lifetime prefixes from https://wiki.openstreetmap.org/wiki/Lifecycle_prefix#Common_prefixes
 */
const lifetimePrefixes=[
	'proposed',
	'planned',
	'construction',
	'disused',
	'abandoned',
	'ruins',
	'demolished',
	'removed',
	'razed',
	'destroyed',
	'was',
]
const lifetimePrefixRegexp=new RegExp('^('+lifetimePrefixes.join('|')+'):(.*)')

export default function compareKeys(k1: string, k2: string): number {
	let prefix1='', rest1=k1
	let prefix2='', rest2=k2
	let match1=k1.match(lifetimePrefixRegexp)
	let match2=k2.match(lifetimePrefixRegexp)
	if (match1) [,prefix1,rest1]=match1
	if (match2) [,prefix2,rest2]=match2
	return strcmp(rest1,rest2) || strcmp(prefix1,prefix2)
}

function strcmp(k1: string, k2: string): number {
	// return k1 < k2 ? -1 : +(k1 > k2)
	return +(k1>k2)-+(k1<k2)
}
