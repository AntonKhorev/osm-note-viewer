import Server from './server'
import {parseServerListSource, parseServerListItem} from './server-list-parser'

export default class ServerList {
	readonly defaultServer: Server
	readonly defaultServerListConfig: unknown
	readonly servers = new Map<string,Server>()
	constructor(...configSources:unknown[]) {
		;[this.defaultServerListConfig]=configSources
		for (const configSource of configSources) {
			try {
				const parametersList=parseServerListSource(configSource)
				for (const parameters of parametersList) {
					const server=new Server(...parameters)
					this.servers.set(server.host,server)
				}
			} catch {}
		}
		if (this.servers.size==0) {
			const parameters=parseServerListItem(null) // shouldn't throw
			const server=new Server(...parameters)
			this.servers.set(server.host,server)
		}
		;[this.defaultServer]=this.servers.values()
	}
}
