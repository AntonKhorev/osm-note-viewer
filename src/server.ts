import {makeEscapeTag} from './escape'

export interface ApiUrlLister {
	api: {
		get url(): string
		getUrl(apiPath:string): string
	}
}

export interface WebUrlLister {
	web: {
		get urls(): readonly string[]
		getUrl(webPath:string): string
	}
}

export interface TileSource {
	get tileUrlTemplate(): string
	get tileAttributionUrl(): string
	get tileAttributionText(): string
	get tileMaxZoom(): number
}

export class QueryError {
	get reason():string {
		return `for unknown reason`
	}
}
export class NetworkQueryError extends QueryError {
	constructor(private message:string) {
		super()
	}
	get reason():string {
		return `with the following error before receiving a response: ${this.message}`
	}
}
export class ResponseQueryError extends QueryError {
	constructor(private text:string) {
		super()
	}
	get reason():string {
		return `receiving the following message: ${this.text}`
	}
}

export class NominatimProvider {
	constructor(private url: string) {}
	async search(parameters:string):Promise<any> {
		const response=await fetch(this.getSearchUrl(parameters))
		if (!response.ok) {
			throw new TypeError('unsuccessful Nominatim response')
		}
		return response.json()
	}
	getSearchUrl(parameters:string):string {
		return this.url+`search?format=jsonv2&`+parameters
	}
	get statusUrl():string {
		return this.url+`status.php?format=json`
	}
}

export class OverpassProvider {
	constructor(private url: string) {}
	async fetch(query:string):Promise<Document> {
		try {
			let response: Response
			try {
				response=await fetch(this.url+`api/interpreter`,{
					method: 'POST',
					body: new URLSearchParams({data:query})
				})
			} catch (ex) {
				if (ex instanceof TypeError) {
					throw new NetworkQueryError(ex.message)
				} else {
					throw ex
				}
			}
			const text=await response.text()
			if (!response.ok) {
				throw new ResponseQueryError(text)
			}
			return new DOMParser().parseFromString(text,'text/xml')
		} catch (ex) {
			if (ex instanceof QueryError) {
				throw ex
			} else {
				throw new QueryError
			}
		}
	}
	get statusUrl():string {
		return this.url+`api/status`
	}
}

export class OverpassTurboProvider {
	constructor(public url: string) {}
	getUrl(query:string,lat:number,lon:number,zoom:number):string {
		const e=makeEscapeTag(encodeURIComponent)
		const location=`${lat};${lon};${zoom}`
		return this.url+e`?C=${location}&Q=${query}`
	}
}

abstract class OsmProvider {
	abstract getUrl(path:string):string
	fetch(path:string,init?:RequestInit) {
		return fetch(this.getUrl(path),init)
	}
	postUrlencoded(path:string,headers:{[k:string]:string},parameters:[k:string,v:string][]) {
		return this.fetch(path,{
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
				...headers
			},
			body: parameters.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')
		})
	}
}

export class WebProvider extends OsmProvider {
	constructor(
		public readonly urls: string[]
	) {
		super()
	}
	getUrl(path:string):string {
		return `${this.urls[0]}${path}`
	}
}

export class ApiProvider extends OsmProvider {
	constructor(
		public readonly url: string
	) {
		super()
	}
	getUrl(path:string):string {
		return `${this.url}api/0.6/${path}`
	}
	getRootUrl(rootPath:string):string { // only used in note export user urls for no good reason other than osm website doing so
		return `${this.url}${rootPath}`
	}
}

export default class Server implements ApiUrlLister, WebUrlLister, TileSource {
	public readonly web: WebProvider
	public readonly api: ApiProvider
	public readonly nominatim: NominatimProvider|undefined
	public readonly overpass: OverpassProvider|undefined
	public readonly overpassTurbo: OverpassTurboProvider|undefined
	constructor(
		public readonly host: string,
		apiUrl: string,
		webUrls: string[],
		public readonly tileUrlTemplate: string,
		public readonly tileAttributionUrl: string,
		public readonly tileAttributionText: string,
		public readonly tileMaxZoom: number,
		public readonly tileOwner: boolean,
		nominatimUrl: string|undefined,
		overpassUrl: string|undefined,
		overpassTurboUrl: string|undefined,
		public readonly noteUrl: string|undefined,
		public readonly noteText: string|undefined,
		public readonly world: string
	) {
		this.web=new WebProvider(webUrls)
		this.api=new ApiProvider(apiUrl)
		if (nominatimUrl!=null) this.nominatim=new NominatimProvider(nominatimUrl)
		if (overpassUrl!=null) this.overpass=new OverpassProvider(overpassUrl)
		if (overpassTurboUrl!=null) this.overpassTurbo=new OverpassTurboProvider(overpassTurboUrl)
	}
}
