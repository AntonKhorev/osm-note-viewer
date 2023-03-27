import type NoteViewerStorage from '../storage'
import type Server from '../net/server'
import type ServerList from '../net/server-list'
import AuthStorage from './storage'
import AuthAppSection from './app-section'
import AuthLoginSection from './login-section'
import {makeElement} from '../util/html'

export {AuthLoginSection}

const installUri=`${location.protocol}//${location.host}${location.pathname}` // TODO get from net/index

export default class Auth {
	readonly authStorage: AuthStorage
	constructor(
		storage: NoteViewerStorage,
		public readonly server: Server,
		private readonly serverList: ServerList
	) {
		this.authStorage=new AuthStorage(storage,server.host,installUri)
	}
	writeMenuSections(
		$container: HTMLElement
	):AuthLoginSection {
		const $appSection=makeElement('section')()()
		const $loginSection=makeElement('section')()()
		const appSection=new AuthAppSection($appSection,this.authStorage,this.server,this.serverList)
		const loginSection=new AuthLoginSection($loginSection,this.authStorage,this.server)
		appSection.onRegistrationUpdate=()=>loginSection.respondToAppRegistration()
		$container.append($loginSection,$appSection)
		return loginSection
	}
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
