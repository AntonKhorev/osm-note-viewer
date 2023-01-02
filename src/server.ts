import {makeEscapeTag} from './escape'

export interface ApiFetcher {
	apiFetch(apiPath:string): Promise<Response>
}

export interface ApiUrlLister {
	get apiUrl(): string
	getApiUrl(apiPath:string):string
}

export interface WebUrlLister {
	get webUrls(): readonly string[]
	getWebUrl(webPath:string): string
}

export interface TileSource {
	get tileUrlTemplate(): string
	get tileAttributionUrl(): string
	get tileAttributionText(): string
	get maxZoom(): number
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
}

export default class Server implements ApiFetcher, ApiUrlLister, WebUrlLister, TileSource {
	public readonly host: string
	public readonly nominatim: NominatimProvider|undefined
	constructor(
		public readonly apiUrl: string,
		public readonly webUrls: string[],
		public readonly tileUrlTemplate: string,
		public readonly tileAttributionUrl: string,
		public readonly tileAttributionText: string,
		public readonly maxZoom: number,
		nominatimUrl: string|undefined,
		private readonly overpassUrl: string,
		private readonly overpassTurboUrl: string,
		public readonly noteUrl: string|undefined,
		public readonly noteText: string|undefined
	) {
		const hostUrl=new URL(webUrls[0])
		this.host=hostUrl.host
		if (nominatimUrl!=null) this.nominatim=new NominatimProvider(nominatimUrl)
	}
	apiFetch(apiPath:string) {
		return fetch(this.getApiUrl(apiPath))
	}
	getApiUrl(apiPath:string):string {
		return `${this.apiUrl}api/0.6/${apiPath}`
	}
	getApiRootUrl(apiRootPath:string):string { // only used in note export user urls for no good reason other than osm website doing so
		return `${this.apiUrl}${apiRootPath}`
	}
	getWebUrl(webPath:string):string {
		return `${this.webUrls[0]}${webPath}`
	}
	async overpassFetch(overpassQuery:string):Promise<Document> {
		try {
			let response: Response
			try {
				response=await fetch(this.overpassUrl+`api/interpreter`,{
					method: 'POST',
					body: new URLSearchParams({data:overpassQuery})
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
	getOverpassTurboUrl(query:string,lat:number,lon:number,zoom:number):string {
		const e=makeEscapeTag(encodeURIComponent)
		const location=`${lat};${lon};${zoom}`
		return this.overpassTurboUrl+e`?C=${location}&Q=${query}`
	}
}
