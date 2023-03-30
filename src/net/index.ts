import Connection from './connection'
import AuthStorage from './auth-storage'
import Server from './server'
import ServerSelector from './server-selector'
import HashServerSelector from './hash-server-selector'
import ServerList from './server-list'
import ServerListSection from './server-list-section'
import AppSection from './app-section'
import LoginSection from './login-section'
import {checkAuthRedirectForInstallUri} from './redirect'

import type {SimpleStorage} from '../util/storage'
import {makeElement} from '../util/html'

export {Connection, Server, ServerList, ServerSelector, HashServerSelector}
export * from './server'

const installUri=`${location.protocol}//${location.host}${location.pathname}`

export function checkAuthRedirect(appName: string) {
	return checkAuthRedirectForInstallUri(appName,installUri)
}

export default class Net<T extends ServerSelector> {
	readonly serverList: ServerList
	readonly serverSelector: T
	readonly cx?: Connection
	readonly $loginSection?: HTMLElement
	readonly $appSection?: HTMLElement
	readonly $serverListSection: HTMLElement
	readonly $sections: HTMLElement[] = []
	private readonly loginSection?: LoginSection
	constructor(
		appName: string,
		oauthScope: string,
		loginReasons: (string|HTMLElement)[],
		serverListConfig: unknown,
		storage: SimpleStorage,
		makeServerSelector: (serverList:ServerList)=>T,
		onLoginChange: ()=>void
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
		const server=this.serverSelector.selectServer()
		this.$serverListSection=makeElement('section')()()
		new ServerListSection(this.$serverListSection,appName,storage,server,this.serverList,this.serverSelector)
		if (server) {
			const authStorage=new AuthStorage(storage,server.host,installUri)
			this.cx=new Connection(server,authStorage)
			this.$appSection=makeElement('section')()()
			this.$loginSection=makeElement('section')()()
			const appSection=new AppSection(this.$appSection,appName,oauthScope,authStorage,server,this.serverSelector)
			const loginSection=new LoginSection(this.$loginSection,appName,oauthScope,loginReasons,authStorage,server,onLoginChange)
			appSection.onRegistrationUpdate=()=>loginSection.respondToAppRegistration()
			this.$sections.push(this.$loginSection,this.$appSection)
			this.loginSection=loginSection
		}
		this.$sections.push(this.$serverListSection)
	}
	focusOnLogin(): void {
		this.loginSection?.focusOnLogin() // TODO move to connection?
	}
}
