import NoteViewerStorage from './storage'
import Server from './server'
import {ol,ul,li,em} from './html-shortcuts'
import {makeElement, makeDiv, makeLink, makeLabel, toggleHideElement, toggleUnhideElement} from './html'

export default class Auth {
}

export class DummyAuth extends Auth {
	// TODO just clean up callback params
}

export class RealAuth extends Auth {
	$appSection: HTMLElement
	$loginSection: HTMLElement
	constructor(storage: NoteViewerStorage, server: Server) {
		super()
		const value=(text:string)=>{
			const $kbd=makeElement('kbd')('copy')(text)
			$kbd.onclick=()=>navigator.clipboard.writeText(text)
			return $kbd
		}
		const manualAuthCodeUri=`urn:ietf:wg:oauth:2.0:oob`

		// app section
		const $clientIdInput=document.createElement('input')
		$clientIdInput.type='text'
		$clientIdInput.value=storage.getString(`host[${server.host}].clientId`)
		this.$appSection=makeElement('section')()(
			makeElement('h3')()(`Register app`),
			ol(
				li(
					`go to `,makeLink(`My Settings > OAuth 2 applications > Register new application`,server.getWebUrl(`oauth2/applications/new`)),
					` on `,em(server.host)
				),li(
					`for `,em(`Name`),` enter anything you like, for example, `,
					value(`osm-note-viewer installed at ${location.protocol}//${location.pathname}${location.search}`)
				),li(
					`for `,em(`Redirect URIs`),` enter `,
					value(manualAuthCodeUri)
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
					`copy `,em(`Client ID`),` to an input below`
				),li(
					`ignore `,em(`Client Secret`),`, this is only for confidential apps, osm-note-viewer is not a confidential apps`
				)
			),
			makeDiv('major-input')(
				makeLabel()(
					`Client ID: `,$clientIdInput
				)
			)
		)

		// login section
		const $clientIdRequired=makeDiv()(
			`Please register the app and enter the `,em(`client id`),` above to be able to login.`
		)
		const $loginForm=document.createElement('form')
		$loginForm.target='_blank' // TODO popup window
		$loginForm.action=server.getWebUrl('oauth2/authorize')
		const $loginButton=document.createElement('button')
		$loginButton.textContent=`Login`
		const $clientIdHiddenInput=makeHiddenInput('client_id')
		$loginForm.append(
			$clientIdHiddenInput,
			makeHiddenInput('response_type','code'),
			makeHiddenInput('scope','read_prefs write_notes'),
			makeHiddenInput('redirect_uri',manualAuthCodeUri),
			makeDiv('major-input')($loginButton)
		)
		const updateLoginSectionInResponseToAppRegistration=()=>{
			$clientIdHiddenInput.value=$clientIdInput.value
			const canLogin=!!$clientIdInput.value
			toggleHideElement($clientIdRequired,canLogin)
			toggleUnhideElement($loginForm,canLogin)
		}
		updateLoginSectionInResponseToAppRegistration()
		this.$loginSection=makeElement('section')()(
			makeElement('h3')()(`Login`),
			$clientIdRequired,
			$loginForm
		)

		// event listeners
		$clientIdInput.oninput=()=>{
			storage.setString(`host[${server.host}].clientId`,$clientIdInput.value)
			updateLoginSectionInResponseToAppRegistration()
		}
	}
}

function makeHiddenInput(name:string,value?:string): HTMLInputElement {
	const $input=document.createElement('input')
	$input.type='hidden'
	$input.name=name
	if (value!=null) $input.value=value
	return $input
}
