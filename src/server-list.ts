import Server from './server'
import parseServerListItem from './server-list-parser'

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
	getServer(hostHash:string|null): Server|undefined {
		if (hostHash==null) return this.defaultServer
		return this.servers.get(hostHash)
	}
}

function makeServer(config?:any): Server {
	return new Server(...parseServerListItem(config))
}
