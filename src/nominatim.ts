import {makeEscapeTag} from './util'

export type NominatimBbox = readonly [minLat:string,maxLat:string,minLon:string,maxLon:string]

function isNominatimBbox(bbox: any): bbox is NominatimBbox {
	if (!Array.isArray(bbox)) return false
	if (bbox.length!=4) return false
	for (const entry of bbox) {
		if (!(typeof entry == "string")) return false
	}
	return true
}

export class NominatimBboxFetcher {
	constructor(
		private fetchFromServer: (url:string)=>Promise<any>,
		private fetchFromCache: (timestamp:number,url:string)=>Promise<any>,
		private storeToCache: (timestamp:number,url:string,bbox:NominatimBbox)=>Promise<any>
	) {}
	async fetch(
		timestamp: number,
		q: string,
		west: number, south: number, east: number, north: number
	): Promise<NominatimBbox> {
		const e=makeEscapeTag(encodeURIComponent)
		const viewbox=`${west},${south},${east},${north}`
		// TODO check if view is very large - like this: -258.04687500000006,-86.89440146775192,258.75000000000006,86.85607435433805 - if so, don't include viewbox arg
		// TODO cache
		const url=e`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}&viewbox=${viewbox}`
		const data=await this.fetchFromServer(url)
		if (!Array.isArray(data)) throw new TypeError('Nominatim error: invalid data')
		if (data.length<=0) {
			throw new TypeError('Nominatim failed to find the place')
		}
		const placeData=data[0]
		const bbox=placeData?.boundingbox
		if (!isNominatimBbox(bbox)) throw new TypeError('Nominatim error: invalid bbox data')
		return bbox
	}
}
