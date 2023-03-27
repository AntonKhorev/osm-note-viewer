import {Server, ServerList} from './net'
import {code} from './util/html-shortcuts'
import {escapeHash} from './util/escape'

export function getHashSearchParams(): URLSearchParams {
	const paramString = (location.hash[0]=='#')
		? location.hash.slice(1)
		: location.hash
	return new URLSearchParams(paramString)
}

export function makeHrefWithCurrentHost(parameters: [k:string,v:string][]): string {
	const hostHashValue=getHashSearchParams().get('host')
	const parametersWithCurrentHost=[]
	if (hostHashValue) parametersWithCurrentHost.push(['host',hostHashValue])
	parametersWithCurrentHost.push(...parameters)
	return '#'+parametersWithCurrentHost.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')
}

export class HashServerSelector {
	readonly hostHashValue: string|null
	constructor(
		private serverList: ServerList
	) {
		const searchParams=getHashSearchParams()
		this.hostHashValue=searchParams.get('host')
	}
	selectServer(): Server|undefined {
		return this.getServer(this.hostHashValue)
	}
	getHostHashValue(server: Server): string|null {
		let hostHashValue:null|string = null
		if (server!=this.serverList.defaultServer) {
			hostHashValue=server.host
		}
		return hostHashValue
	}
	getServerSelectHref(server: Server): string {
		const baseLocation=location.pathname+location.search
		const hashValue=this.getHostHashValue(server)
		return baseLocation+(hashValue ? `#host=`+escapeHash(hashValue) : '')
	}
	addServerSelectToAppInstallLocationHref(server: Server, installLocationHref: string): string {
		const hashValue=this.getHostHashValue(server)
		return installLocationHref+(hashValue ? `#host=`+escapeHash(hashValue) : '')
	}
	makeServerSelectErrorMessage(): (string|HTMLElement)[] {
		const hostHash=(this.hostHashValue!=null
			? `host=`+escapeHash(this.hostHashValue)
			: ``
		)
		return [
			`Unknown server in URL hash parameter `,code(hostHash),`.`
		]
	}
	getServer(hostHashValue: string|null): Server|undefined {
		if (hostHashValue==null) return this.serverList.defaultServer
		return this.serverList.servers.get(hostHashValue)
	}
}
