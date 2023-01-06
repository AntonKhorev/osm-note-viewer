import Server from './server'
import {parseServerListSource, parseServerListItem} from './server-list-parser'

export default class ServerList {
	private defaultServer: Server
	servers = new Map<string,Server>()
	constructor(...configSources:unknown[]) {
		let defaultServer: Server|undefined
		for (const configSource of configSources) {
			try {
				const parametersList=parseServerListSource(configSource)
				for (const parameters of parametersList) {
					const server=new Server(...parameters)
					this.servers.set(server.host,server)
					if (!defaultServer) defaultServer=server
				}
			} catch {}
		}
		if (!defaultServer) {
			const parameters=parseServerListItem(null) // shouldn't throw
			const server=new Server(...parameters)
			this.servers.set(server.host,server)
			defaultServer=server
		}
		this.defaultServer=defaultServer
	}
	getHostHashValue(server:Server): string|null {
		let hostHashValue:null|string = null
		if (server!=this.defaultServer) {
			hostHashValue=server.host
		}
		return hostHashValue
	}
	getServer(hostHash:string|null): Server|undefined {
		if (hostHash==null) return this.defaultServer
		return this.servers.get(hostHash)
	}
}
