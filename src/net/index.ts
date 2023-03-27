import type NoteViewerStorage from '../storage'

import Server from './server'
import ServerList from './server-list'
import ServerListSection from './server-list-section'
import {checkAuthRedirectForInstallUri} from './redirect'

import {makeElement} from '../util/html'

export {Server, ServerList}

const installUri=`${location.protocol}//${location.host}${location.pathname}`

export function checkAuthRedirect() {
	return checkAuthRedirectForInstallUri(installUri)
}

export interface ServerSelector {
	selectServer(): Server|undefined
	getServerSelectHref(server: Server): string
	addServerSelectToAppInstallLocationHref(server: Server, installLocationHref: string): string
	makeServerSelectErrorMessage(): (string|HTMLElement)[]
}

export default class Net<T extends ServerSelector> {
	readonly serverList: ServerList
	readonly serverSelector: T
	readonly server?: Server
	readonly $serverListSection: HTMLElement
	constructor(
		storage: NoteViewerStorage,
		serverListConfig: unknown,
		makeServerSelector: (serverList:ServerList)=>T
	) {
		const serverListConfigSources:unknown[]=[serverListConfig]
		try {
			const customServerListConfig=storage.getItem('servers')
			if (customServerListConfig!=null) {
				serverListConfigSources.push(JSON.parse(customServerListConfig))
			}
		} catch {}
		this.serverList=new ServerList(...serverListConfigSources)
		this.serverSelector=makeServerSelector(this.serverList)
		this.server=this.serverSelector.selectServer()
		this.$serverListSection=makeElement('section')()()
		new ServerListSection(this.$serverListSection,storage,this.server,this.serverList,this.serverSelector)
	}
}
