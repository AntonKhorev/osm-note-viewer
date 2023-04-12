import ServerList from './server-list'

export default class WorkerNet {
	readonly serverList: ServerList
	constructor(
		serverListConfig: unknown
	) {
		const serverListConfigSources:unknown[]=[serverListConfig]
		// TODO receive updates to custom server config through worker messages
		// try {
		// 	const customServerListConfig=storage.getItem('servers')
		// 	if (customServerListConfig!=null) {
		// 		serverListConfigSources.push(JSON.parse(customServerListConfig))
		// 	}
		// } catch {}
		this.serverList=new ServerList(...serverListConfigSources)
	}
}
