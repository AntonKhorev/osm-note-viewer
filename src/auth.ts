import NoteViewerStorage from './storage'
import Server from './server'
import AuthStorage from './auth/storage'
import AuthAppSection from './auth/app-section'
import AuthLoginSection from './auth/login-section'
import {makeElement} from './html'

export default abstract class Auth {
	receivedCode(): boolean {
		const params=new URLSearchParams(location.search)
		const code=params.get('code')
		if (code==null) return false
		if (window.opener && typeof window.opener.receiveOsmNoteViewerAuthCode == 'function') {
			window.opener.receiveOsmNoteViewerAuthCode(code)
		}
		return true
	}
}

export class DummyAuth extends Auth {
	// TODO just clean up callback params
}

export class RealAuth extends Auth {
	$appSection=makeElement('section')()()
	$loginSection=makeElement('section')()()
	constructor(storage: NoteViewerStorage, server: Server) {
		super()
		const authStorage=new AuthStorage(storage,server.host)
		const appSection=new AuthAppSection(this.$appSection,authStorage,server)
		const loginSection=new AuthLoginSection(this.$loginSection,authStorage,server)
		appSection.onRegistrationUpdate=()=>loginSection.respondToAppRegistration()
	}
}
