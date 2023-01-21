import NoteViewerStorage from './storage'
import Server from './server'
import AuthStorage from './auth/storage'
import AuthAppSection from './auth/app-section'
import AuthLoginSection from './auth/login-section'
import {makeElement} from './html'

export default class Auth {
	checkReceivedCode(): boolean {
		const params=new URLSearchParams(location.search)
		const code=params.get('code')
		if (code==null) return false
		if (window.opener && typeof window.opener.receiveOsmNoteViewerAuthCode == 'function') {
			window.opener.receiveOsmNoteViewerAuthCode(code)
		}
		return true
	}
	writeAboutDialogSections(
		$container: HTMLElement,
		storage: NoteViewerStorage, server: Server|undefined
	):void {
		if (!server) return
		const $appSection=makeElement('section')()()
		const $loginSection=makeElement('section')()()
		const authStorage=new AuthStorage(storage,server.host)
		const appSection=new AuthAppSection($appSection,authStorage,server)
		const loginSection=new AuthLoginSection($loginSection,authStorage,server)
		appSection.onRegistrationUpdate=()=>loginSection.respondToAppRegistration()
		$container.append($appSection,$loginSection)
	}
}
