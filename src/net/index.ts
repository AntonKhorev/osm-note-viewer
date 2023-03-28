import AuthStorage from './auth-storage'
import Server from './server'
import ServerList from './server-list'
import ServerListSection from './server-list-section'
import AppSection from './app-section'
import LoginSection from './login-section'
import {checkAuthRedirectForInstallUri} from './redirect'

import type {SimpleStorage} from '../util/storage'
import {makeElement} from '../util/html'

export {Server, ServerList}
export * from './server'

const installUri=`${location.protocol}//${location.host}${location.pathname}`

export function checkAuthRedirect(appName: string) {
	return checkAuthRedirectForInstallUri(appName,installUri)
}

export interface ServerSelector {
	selectServer(): Server|undefined
	getServerSelectHref(server: Server): string
	addServerSelectToAppInstallLocationHref(server: Server, installLocationHref: string): string
	makeServerSelectErrorMessage(): (string|HTMLElement)[]
}

export class Connection {
	constructor(
		readonly server: Server,
		private readonly authStorage: AuthStorage
	) {}
	get token(): string {
		return this.authStorage.token
	}
	get username(): string|undefined {
		return this.authStorage.login?.username
	}
	get uid(): number|undefined {
		return this.authStorage.login?.uid
	}
	get isModerator(): boolean {
		return this.authStorage.login?.roles?.includes('moderator')??false
	}
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
		storage: SimpleStorage,
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
		const server=this.serverSelector.selectServer()
		this.$serverListSection=makeElement('section')()()
		new ServerListSection(this.$serverListSection,appName,storage,server,this.serverList,this.serverSelector)
		if (server) {
			const authStorage=new AuthStorage(storage,server.host,installUri)
			this.cx=new Connection(server,authStorage)
			this.$appSection=makeElement('section')()()
			this.$loginSection=makeElement('section')()()
			const appSection=new AppSection(this.$appSection,appName,authStorage,server,this.serverSelector)
			const loginSection=new LoginSection(this.$loginSection,appName,authStorage,server)
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
