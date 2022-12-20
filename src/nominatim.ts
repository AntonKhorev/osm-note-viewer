import {makeEscapeTag} from './escape'

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
	urlBase=`https://nominatim.openstreetmap.org/search`
	getUrl(
		q: string,
		west: number, south: number, east: number, north: number
	): string {
		const e=makeEscapeTag(encodeURIComponent)
		let url=this.urlBase+e`?format=json&limit=1&q=${q}`
		if (east>west && north>south && east-west<360) {
			const viewbox=`${west},${south},${east},${north}`
			url+=e`&viewbox=${viewbox}`
		}
		return url
	}
	async fetch(
		timestamp: number,
		q: string,
		west: number, south: number, east: number, north: number
	): Promise<NominatimBbox> {
		const url=this.getUrl(q,west,south,east,north)
		const cacheBbox=await this.fetchFromCache(timestamp,url)
		if (isNominatimBbox(cacheBbox)) {
			await this.storeToCache(timestamp,url,cacheBbox)
			return cacheBbox
		}
		const data=await this.fetchFromServer(url)
		if (!Array.isArray(data)) throw new TypeError('Nominatim error: invalid data')
		if (data.length<=0) throw new TypeError('Nominatim failed to find the place')
		const placeData=data[0]
		const bbox=placeData?.boundingbox
		if (!isNominatimBbox(bbox)) throw new TypeError('Nominatim error: invalid bbox data')
		await this.storeToCache(timestamp,url,bbox)
		return bbox
	}
}
