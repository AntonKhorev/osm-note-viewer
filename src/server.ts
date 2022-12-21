export interface ApiFetcher {
	apiFetch(apiPath:string):Promise<Response>
}

export default class Server implements ApiFetcher {
	constructor(
		private readonly webUrl: string,
		private readonly apiUrl: string
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
		return `${this.webUrl}${webPath}`
	}
}
