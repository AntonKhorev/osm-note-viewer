import {escapeHash} from '../util/escape'

// can't use URLSearchParams for encoding because of different escaping

export function getHashFromLocation(): string {
	return (location.hash[0]=='#'
		? location.hash.slice(1)
		: location.hash
	)
}

/**
 * Splits &-separated string into first 'host' parameter value
 */
export function splitHostFromHash(hash: string): [host:string|null,hostlessHash:string] {
	let metHost=false
	let hostHashValue: string|null = null
	const hostlessParts: string[] = []
	for (const part of hash.split('&')) {
		if (metHost) {
			hostlessParts.push(part)
			continue
		}
		const detectedHostHashValue=new URLSearchParams(part).get('host')
		if (detectedHostHashValue==null) {
			hostlessParts.push(part)
		} else {
			hostHashValue=detectedHostHashValue
			metHost=true
		}
	}
	return [hostHashValue,hostlessParts.join('&')]
}

export function joinHostToHash(hostHashValue:string|null, hostlessHash:string): string {
	if (hostHashValue==null) return hostlessHash
	return `host=`+escapeHash(hostHashValue)+`&`+hostlessHash
}
