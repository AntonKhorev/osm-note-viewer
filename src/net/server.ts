import {makeLink} from '../util/html'
import {makeEscapeTag} from '../util/escape'

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

export interface ApiUrlLister {
	get url(): string
}

export interface WebUrlLister {
	get urls(): readonly string[]
	getUrl(webPath:string): string
}

abstract class OsmProvider {
	abstract getUrl(path:string):string
	get fetch() {
		let method: string|undefined
		const headers: {[key:string]:string} ={}
		let body: string|undefined
		const fetcher=(path:string,init?:RequestInit)=>{
			const hasHeaders=Object.keys(headers).length>0
			if (method!=null || hasHeaders || body!=null) {
				init={...init}
				if (method!=null) {
					init.method=method
				}
				if (hasHeaders) {
					init.headers=new Headers([
						...new Headers(headers),
						...new Headers(init.headers)
					])
				}
				if (body!=null && init.body==null) {
					init.body=body
				}
			}
			return fetch(this.getUrl(path),init)
		}
		fetcher.post=(path:string,init?:RequestInit)=>{
			method='POST'
			return fetcher(path,init)
		}
		fetcher.delete=(path:string,init?:RequestInit)=>{
			method='DELETE'
			return fetcher(path,init)
		}
		fetcher.withUrlencodedBody=(parameters:[k:string,v:string][])=>{
			headers['Content-Type']='application/x-www-form-urlencoded; charset=utf-8'
			body=parameters.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')
			return fetcher
		}
		fetcher.withToken=(token:string|undefined)=>{
			if (token) headers['Authorization']='Bearer '+token
			return fetcher
		}
		return fetcher
	}
}

export class WebProvider extends OsmProvider implements WebUrlLister {
	constructor(
		public readonly urls: string[]
	) {
		super()
	}
	getUrl(path:string):string {
		return `${this.urls[0]}${path}`
	}
	getNoteLocationUrl(lat:number,lon:number) {
		return this.getUrl(`#map=15/${lat.toFixed(4)}/${lon.toFixed(4)}&layers=N`)
	}
	makeUserLink(uid:number,username:string):HTMLAnchorElement {
		const href=this.getUrl(`user/`+encodeURIComponent(username))
		const $a=makeLink(username,href)
		$a.classList.add('listened')
		$a.dataset.userName=username
		$a.dataset.userId=String(uid)
		return $a
	}
}

export class ApiProvider extends OsmProvider implements ApiUrlLister {
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

export class TileProvider {
	constructor(
		public readonly urlTemplate: string,
		public readonly attributionUrl: string,
		public readonly attributionText: string,
		public readonly maxZoom: number,
		public readonly owner: boolean
	) {}
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

export default class Server {
	public readonly web: WebProvider
	public readonly api: ApiProvider
	public readonly tile: TileProvider
	public readonly nominatim: NominatimProvider|undefined
	public readonly overpass: OverpassProvider|undefined
	public readonly overpassTurbo: OverpassTurboProvider|undefined
	constructor(
		public readonly host: string,
		apiUrl: string,
		webUrls: string[],
		tileUrlTemplate: string,
		tileAttributionUrl: string,
		tileAttributionText: string,
		tileMaxZoom: number,
		tileOwner: boolean,
		nominatimUrl: string|undefined,
		overpassUrl: string|undefined,
		overpassTurboUrl: string|undefined,
		public readonly noteUrl: string|undefined,
		public readonly noteText: string|undefined,
		public readonly world: string,
		public readonly oauthId: string|undefined,
		/** 
		  * App location registered with OSM server to receive auth redirects
		  */
		public readonly oauthUrl: string|undefined
	) {
		this.web=new WebProvider(webUrls)
		this.api=new ApiProvider(apiUrl)
		this.tile=new TileProvider(
			tileUrlTemplate,
			tileAttributionUrl,
			tileAttributionText,
			tileMaxZoom,
			tileOwner
		)
		if (nominatimUrl!=null) this.nominatim=new NominatimProvider(nominatimUrl)
		if (overpassUrl!=null) this.overpass=new OverpassProvider(overpassUrl)
		if (overpassTurboUrl!=null) this.overpassTurbo=new OverpassTurboProvider(overpassTurboUrl)
	}
}
