export interface ApiFetcher {
	apiFetch(apiPath:string):Promise<Response>
}

export interface WebUrlLister {
	get webUrls(): readonly string[]
	getWebUrl(webPath:string):string
}

export default class Server implements ApiFetcher, WebUrlLister {
	constructor(
		private readonly apiUrl: string,
		public readonly webUrls: string[]
	) {}
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
}
