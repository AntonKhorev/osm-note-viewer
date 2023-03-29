import type {Server, ServerList, ServerSelector} from './net'
import {code} from './util/html-shortcuts'
import {escapeHash} from './util/escape'

export function getHashSearchParams(): URLSearchParams {
	const paramString = (location.hash[0]=='#')
		? location.hash.slice(1)
		: location.hash
	return new URLSearchParams(paramString)
}

export class HashServerSelector implements ServerSelector {
	readonly hostHashValue: string|null
	constructor(
		private serverList: ServerList
	) {
		const searchParams=getHashSearchParams()
		this.hostHashValue=searchParams.get('host')
	}

	// generic server selector methods
	selectServer(): Server|undefined {
		return this.getServerForHostHashValue(this.hostHashValue)
	}
	getServerSelectHref(server: Server): string {
		const baseLocation=location.pathname+location.search
		const hashValue=this.getHostHashValueForServer(server)
		return baseLocation+(hashValue ? `#host=`+escapeHash(hashValue) : '')
	}
	addServerSelectToAppInstallLocationHref(server: Server, installLocationHref: string): string {
		const hashValue=this.getHostHashValueForServer(server)
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
	
	// host-hash-specific methods
	getHostHashValueForServer(server: Server): string|null {
		let hostHashValue:null|string = null
		if (server!=this.serverList.defaultServer) {
			hostHashValue=server.host
		}
		return hostHashValue
	}
	getServerForHostHashValue(hostHashValue: string|null): Server|undefined {
		if (hostHashValue==null) return this.serverList.defaultServer
		return this.serverList.servers.get(hostHashValue)
	}
}
