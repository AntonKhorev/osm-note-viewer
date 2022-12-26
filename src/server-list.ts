import Server from './server'

export default class ServerList {
	private defaultServer: Server
	servers = new Map<string,Server>()
	constructor(configList:Iterable<any>) {
		let defaultServer: Server|undefined
		for (const config of configList) {
			const server=makeServer(config)
			this.servers.set(server.host,server)
			if (!defaultServer) defaultServer=server
		}
		if (!defaultServer) {
			const server=makeServer()
			this.servers.set(server.host,server)
			defaultServer=server
		}
		this.defaultServer=defaultServer
	}
	getHostHash(server:Server): string|null {
		let hostHash:null|string = null
		if (server!=this.defaultServer) {
			hostHash=server.host
		}
		return hostHash
	}
	getServer(hostHash:string|null): Server {
		if (hostHash==null) return this.defaultServer
		const server=this.servers.get(hostHash)
		if (!server) throw new TypeError(`unknown host "${hostHash}"`)
		return server
	}
}

function makeServer(config?:any): Server {
	let apiUrl: string = `https://api.openstreetmap.org/`
	let webUrls: string[] = [
		`https://www.openstreetmap.org/`,
		`https://openstreetmap.org/`,
		`https://www.osm.org/`,
		`https://osm.org/`,
	]
	let tileUrlTemplate: string = `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
	let tileAttributionUrl: string = `https://www.openstreetmap.org/copyright`
	let tileAttributionText: string = `OpenStreetMap contributors`
	let maxZoom: number = 19
	let nominatimUrl: string = `https://nominatim.openstreetmap.org/`
	let overpassUrl: string = `https://www.overpass-api.de/`
	
	if (typeof config == 'string') {
		apiUrl=config
		webUrls=[config]
	}

	return new Server(
		apiUrl,webUrls,
		tileUrlTemplate,tileAttributionUrl,tileAttributionText,maxZoom,
		nominatimUrl,overpassUrl
	)
}
