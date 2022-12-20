export interface ApiFetcher {
	apiFetch(apiPath:string):Promise<Response>
}

export default class Server implements ApiFetcher {
	constructor(private readonly apiUrl:string) {}
	apiFetch(apiPath:string) {
		return fetch(this.getApiFetchUrl(apiPath))
	}
	getApiFetchUrl(apiPath:string):string { // TODO rename to getApiUrl
		return `${this.apiUrl}api/0.6/${apiPath}`
	}
	getWebUrl(webPath:string):string {
		return `https://www.openstreetmap.org/${webPath}`
	}
}
