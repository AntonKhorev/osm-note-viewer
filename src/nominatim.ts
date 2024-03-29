import type {NominatimProvider} from './net'
import {makeEscapeTag} from './util/escape'

const e=makeEscapeTag(encodeURIComponent)

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
		private nominatim: NominatimProvider,
		private fetchFromCache: (timestamp:number,parameters:string)=>Promise<any>,
		private storeToCache: (timestamp:number,parameters:string,bbox:NominatimBbox)=>Promise<any>
	) {}
	getParameters(
		q: string,
		viewbox: [w:string,s:string,e:string,n:string]
	): string {
		return this.addCommonParameters(
			e`q=${q}`,
			viewbox
		)
	}
	getStructuredParameters(
		values: {[name: string]: string},
		viewbox: [w:string,s:string,e:string,n:string]
	): string {
		return this.addCommonParameters(
			Object.entries(values).map(([name,value])=>e`${name}=${value}`).join('&'),
			viewbox
		)
	}
	private addCommonParameters(
		parameters: string,
		viewbox: [w:string,s:string,e:string,n:string]
	): string {
		parameters=`limit=1&`+parameters
		const [west,south,east,north]=viewbox.map(Number)
		if (east>west && north>south && east-west<360) {
			parameters+=e`&viewbox=${viewbox}`
		}
		return parameters
	}
	async fetch(
		timestamp: number,
		parameters: string
	): Promise<NominatimBbox> {
		const cacheBbox=await this.fetchFromCache(timestamp,parameters)
		if (isNominatimBbox(cacheBbox)) {
			await this.storeToCache(timestamp,parameters,cacheBbox)
			return cacheBbox
		}
		const data=await this.nominatim.search(parameters)
		if (!Array.isArray(data)) throw new TypeError('Nominatim error: invalid data')
		if (data.length<=0) throw new TypeError('Nominatim failed to find the place')
		const placeData=data[0]
		const bbox=placeData?.boundingbox
		if (!isNominatimBbox(bbox)) throw new TypeError('Nominatim error: invalid bbox data')
		await this.storeToCache(timestamp,parameters,bbox)
		return bbox
	}
}
