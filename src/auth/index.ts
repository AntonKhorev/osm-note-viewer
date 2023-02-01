import type NoteViewerStorage from '../storage'
import type Server from '../server'
import type ServerList from '../server-list'
import AuthStorage from './storage'
import AuthAppSection from './app-section'
import AuthLoginSection from './login-section'
import {makeElement, makeDiv, makeLink} from '../html'

interface AuthOpener {
	receiveOsmNoteViewerAuthCode(code:unknown):unknown
	receiveOsmNoteViewerAuthDenial(errorDescription:unknown):unknown
}
function isAuthOpener(o:any): o is AuthOpener {
	return (
		o && typeof o == 'object' &&
		typeof o.receiveOsmNoteViewerAuthCode == 'function' &&
		typeof o.receiveOsmNoteViewerAuthDenial == 'function'
	)
}

const installUri=`${location.protocol}//${location.host}${location.pathname}`

export function checkAuthRedirect(): boolean {
	const params=new URLSearchParams(location.search)
	const code=params.get('code')
	const error=params.get('error')
	const errorDescription=params.get('error_description')
	if (code==null && error==null) {
		return false
	}
	if (!isAuthOpener(window.opener)) {
		document.body.append(makeDiv('notice')(
			`You opened the location of note-viewer's authentication redirect for a popup window outside of a popup window. `,
			`If you want to continue using note-viewer, please open `,makeLink(`this link`,installUri),`.`
		))
	} else if (code!=null) {
		window.opener.receiveOsmNoteViewerAuthCode(code)
	} else if (error!=null) {
		window.opener.receiveOsmNoteViewerAuthDenial(errorDescription??error)
	}
	return true
}

export default class Auth {
	onLoginChange?: ()=>void
	readonly authStorage: AuthStorage
	constructor(
		storage: NoteViewerStorage,
		public readonly server: Server,
		private readonly serverList: ServerList
	) {
		this.authStorage=new AuthStorage(storage,server.host,installUri)
	}
	writeAboutDialogSections(
		$container: HTMLElement
	):void {
		const $appSection=makeElement('section')()()
		const $loginSection=makeElement('section')()()
		const appSection=new AuthAppSection($appSection,this.authStorage,this.server,this.serverList)
		const loginSection=new AuthLoginSection($loginSection,this.authStorage,this.server,
			()=>this.onLoginChange?.()
		)
		appSection.onRegistrationUpdate=()=>loginSection.respondToAppRegistration()
		$container.append($appSection,$loginSection)
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
