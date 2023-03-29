import {escapeHash} from '../util/escape'

// can't use URLSearchParams for encoding because of different escaping

export function getHashFromLocation(): string {
	return (location.hash[0]=='#'
		? location.hash.slice(1)
		: location.hash
	)
}

export function detachValueFromHash(key: string, hash: string): [value:string|null,restOfHash:string] {
	let metKey=false
	let value: string|null = null
	const restParts: string[] = []
	for (const part of hash.split('&')) {
		if (metKey) {
			restParts.push(part)
			continue
		}
		const detectedValue=new URLSearchParams(part).get(key)
		if (detectedValue==null) {
			restParts.push(part)
		} else {
			value=detectedValue
			metKey=true
		}
	}
	return [value,restParts.join('&')]
}

export function attachValueToFrontOfHash(key: string, value: string|null, restOfHash: string): string {
	if (value==null) return restOfHash
	const valueHash=`${key}=${escapeHash(value)}`
	if (!restOfHash) return valueHash
	return `${valueHash}&${restOfHash}`
}

export function attachValueToBackOfHash(key: string, value: string|null, restOfHash: string): string {
	if (value==null) return restOfHash
	const valueHash=`${key}=${escapeHash(value)}`
	if (!restOfHash) return valueHash
	return `${restOfHash}&${valueHash}`
}
