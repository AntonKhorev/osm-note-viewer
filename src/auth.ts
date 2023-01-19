import NoteViewerStorage from './storage'
import Server from './server'
import AuthStorage from './auth-storage'
import AuthLoginSection from './auth-login-section'
import {p,ol,ul,li,em} from './html-shortcuts'
import {makeElement, makeDiv, makeLink, makeLabel} from './html'

export default abstract class Auth {
}

export class DummyAuth extends Auth {
	// TODO just clean up callback params
}

export class RealAuth extends Auth {
	$appSection: HTMLElement
	$loginSection=makeElement('section')()()
	constructor(storage: NoteViewerStorage, server: Server) {
		super()
		const authStorage=new AuthStorage(storage,server.host)
		const value=(text:string)=>{
			const $kbd=makeElement('kbd')('copy')(text)
			$kbd.onclick=()=>navigator.clipboard.writeText(text)
			return $kbd
		}
		const manualCodeUri=`urn:ietf:wg:oauth:2.0:oob`

		// app section
		const $clientIdInput=document.createElement('input')
		$clientIdInput.type='text'
		$clientIdInput.value=authStorage.clientId
		this.$appSection=makeElement('section')()(
			makeElement('h3')()(`Register app`),
			ol(
				li(
					`go to `,makeLink(`My Settings > OAuth 2 applications > Register new application`,server.getWebUrl(`oauth2/applications/new`)),
					` on `,em(server.host)
				),li(
					`for `,em(`Name`),` enter anything you like, for example, `,
					value(`osm-note-viewer @ ${location.protocol}//${location.host}${location.pathname}`)
				),li(
					`for `,em(`Redirect URIs`),` enter `,
					value(manualCodeUri)
				),li(
					`uncheck `,em(`Confidential application?`)
				),li(
					`in `,em(`Permissions`),` check:`,ul(
						li(`Read user preferences`),
						li(`Modify notes`)
					)
				),li(
					`click `,em(`Register`)
				),li(
					`copy the `,em(`Client ID`),` to an input below`
				),li(
					`don't copy the `,em(`Client Secret`),`; you can write it down somewhere but it's going to be useless because osm-note-viewer is not a confidential app and can't keep secrets`
				)
			),
			p(`After these steps you should be able to see osm-note-viewer in `,makeLink(`your client applications`,server.getWebUrl(`oauth2/applications`)),` and copy its client id from there.`),
			makeDiv('major-input')(
				makeLabel()(
					`Client ID: `,$clientIdInput
				)
			)
		)

		const loginSection=new AuthLoginSection(this.$loginSection,authStorage,server,manualCodeUri)

		// event listeners
		$clientIdInput.oninput=()=>{
			authStorage.clientId=$clientIdInput.value.trim()
			loginSection.updateInResponseToAppRegistration()
		}
	}
}
