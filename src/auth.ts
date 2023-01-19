import NoteViewerStorage from './storage'
import Server from './server'
import AuthStorage from './auth/storage'
import AuthAppSection from './auth/app-section'
import AuthLoginSection from './auth/login-section'
import {makeElement} from './html'

export default abstract class Auth {
}

export class DummyAuth extends Auth {
	// TODO just clean up callback params
}

export class RealAuth extends Auth {
	$appSection=makeElement('section')()()
	$loginSection=makeElement('section')()()
	constructor(storage: NoteViewerStorage, server: Server) {
		super()
		const manualCodeUri=`urn:ietf:wg:oauth:2.0:oob`
		const authStorage=new AuthStorage(storage,server.host)
		const appSection=new AuthAppSection(this.$appSection,authStorage,server,manualCodeUri)
		const loginSection=new AuthLoginSection(this.$loginSection,authStorage,server,manualCodeUri)
		appSection.onRegistrationUpdate=()=>loginSection.updateInResponseToAppRegistration()
	}
}
