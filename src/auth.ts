import NoteViewerStorage from './storage'
import Server from './server'
import {p,ol,ul,li,em} from './html-shortcuts'
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
		const manualCodeUri=`urn:ietf:wg:oauth:2.0:oob`
		const getClientId=()=>storage.getString(`host[${server.host}].clientId`)
		const setClientId=(clientId:string)=>storage.setString(`host[${server.host}].clientId`,$clientIdInput.value)

		// app section
		const $clientIdInput=document.createElement('input')
		$clientIdInput.type='text'
		$clientIdInput.value=getClientId()
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
					`copy `,em(`Client ID`),` to an input below`
				),li(
					`ignore `,em(`Client Secret`),`, this is only for confidential apps, osm-note-viewer is not a confidential apps`
				)
			),
			p(`After these steps you should be able to see osm-note-viewer in `,makeLink(`your client applications`,server.getWebUrl(`oauth2/applications`)),` and copy its client id from there.`),
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
		const $manualLoginForm=document.createElement('form')
		$manualLoginForm.target='_blank' // TODO popup window
		$manualLoginForm.action=server.getWebUrl('oauth2/authorize')
		const $manualLoginButton=document.createElement('button')
		$manualLoginButton.textContent=`Open an OSM login page that generates an authorization code`
		const $clientIdHiddenInput=makeHiddenInput('client_id')
		$manualLoginForm.append(
			$clientIdHiddenInput,
			makeHiddenInput('response_type','code'),
			makeHiddenInput('scope','read_prefs write_notes'),
			makeHiddenInput('redirect_uri',manualCodeUri),
			makeDiv('major-input')($manualLoginButton)
		)
		const $manualCodeForm=document.createElement('form')
		const $manualCodeInput=document.createElement('input')
		$manualCodeInput.type='text'
		$manualCodeInput.required=true
		const $manualCodeButton=document.createElement('button')
		$manualCodeButton.textContent=`Login with the authorization code`
		$manualCodeForm.append(
			makeDiv('major-input')(
				makeLabel()(`Authorization code: `,$manualCodeInput)
			),makeDiv('major-input')(
				$manualCodeButton
			)
		)
		const updateLoginSectionInResponseToAppRegistration=()=>{
			const clientId=getClientId()
			$clientIdHiddenInput.value=clientId
			const canLogin=!!clientId
			toggleHideElement($clientIdRequired,canLogin)
			toggleUnhideElement($manualLoginForm,canLogin)
			toggleUnhideElement($manualCodeForm,canLogin)
		}
		updateLoginSectionInResponseToAppRegistration()
		this.$loginSection=makeElement('section')()(
			makeElement('h3')()(`Logins`),
			$clientIdRequired,
			$manualLoginForm,
			$manualCodeForm
		)

		// event listeners
		$clientIdInput.oninput=()=>{
			setClientId($clientIdInput.value)
			updateLoginSectionInResponseToAppRegistration()
		}
		$manualCodeForm.onsubmit=async(ev)=>{
			ev.preventDefault()
			const parameters: [string,string][] = [
				['client_id',getClientId()],
				['redirect_uri',manualCodeUri],
				['grant_type','authorization_code'],
				['code',$manualCodeInput.value]
			]
			const response=await server.webFetch(`oauth2/token`,{
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: parameters.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')
			})
			// TODO disable/enable the button
			// TODO report error
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
