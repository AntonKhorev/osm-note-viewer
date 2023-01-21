import NoteViewerStorage from './storage'
import Server from './server'
import AuthStorage from './auth/storage'
import AuthAppSection from './auth/app-section'
import AuthLoginSection from './auth/login-section'
import {makeElement, makeDiv, makeLink} from './html'

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

export default class Auth {
	readonly installUri=`${location.protocol}//${location.host}${location.pathname}`
	checkRedirect(): boolean {
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
				`If you want to continue using note-viewer, please open `,makeLink(`this link`,this.installUri),`.`
			))
		} else if (code!=null) {
			window.opener.receiveOsmNoteViewerAuthCode(code)
		} else if (error!=null) {
			window.opener.receiveOsmNoteViewerAuthDenial(errorDescription??error)
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
		const authStorage=new AuthStorage(storage,server.host,this.installUri)
		const appSection=new AuthAppSection($appSection,authStorage,server)
		const loginSection=new AuthLoginSection($loginSection,authStorage,server)
		appSection.onRegistrationUpdate=()=>loginSection.respondToAppRegistration()
		$container.append($appSection,$loginSection)
	}
}
