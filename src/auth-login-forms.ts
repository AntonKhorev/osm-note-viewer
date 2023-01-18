import {
	makeDiv, makeLabel,
	hideElement, unhideElement,
	wrapFetch, makeGetKnownErrorMessage
} from './html'

export class AuthError extends TypeError {}

export default class AuthLoginForms {
	readonly $manualLoginForm=document.createElement('form')
	readonly $manualCodeForm=document.createElement('form')
	private readonly $clientIdHiddenInput=makeHiddenInput('client_id')
	private readonly $manualCodeInput=document.createElement('input')
	constructor(
		authorizeUrl: string,
		manualCodeUri: string,
		exchangeCodeForToken: (clientId:string,redirectUri:string,code:string)=>Promise<void>
	) {
		this.$manualLoginForm.target='_blank' // TODO popup window
		this.$manualLoginForm.action=authorizeUrl
		const $manualLoginButton=document.createElement('button')
		$manualLoginButton.textContent=`Open an OSM login page that generates an authorization code`
		this.$manualLoginForm.append(
			this.$clientIdHiddenInput,
			makeHiddenInput('response_type','code'),
			makeHiddenInput('scope','read_prefs write_notes'),
			makeHiddenInput('redirect_uri',manualCodeUri),
			makeDiv('major-input')($manualLoginButton)
		)
		this.$manualCodeInput.type='text'
		this.$manualCodeInput.required=true
		const $manualCodeButton=document.createElement('button')
		$manualCodeButton.textContent=`Login with the authorization code`
		const $manualCodeError=makeDiv('notice')()
		this.stopWaitingForCode()

		this.$manualLoginForm.onsubmit=()=>{
			this.waitForCode()
		}
		this.$manualCodeForm.onsubmit=(ev)=>wrapFetch($manualCodeButton,async()=>{
			ev.preventDefault()
			await exchangeCodeForToken(this.$clientIdHiddenInput.value,manualCodeUri,this.$manualCodeInput.value.trim())
			this.stopWaitingForCode()
		},makeGetKnownErrorMessage(AuthError),$manualCodeError,message=>$manualCodeError.textContent=message)

		this.$manualCodeForm.append(
			makeDiv('major-input')(
				makeLabel()(`Authorization code: `,this.$manualCodeInput)
			),makeDiv('major-input')(
				$manualCodeButton
			),$manualCodeError
		)
	}
	set clientId(clientId:string) {
		this.stopWaitingForCode()
		this.$clientIdHiddenInput.value=clientId
	}
	private waitForCode() {
		unhideElement(this.$manualCodeForm)
	}
	private stopWaitingForCode() {
		hideElement(this.$manualCodeForm)
		this.$manualCodeInput.value=''
	}
}

function makeHiddenInput(name:string,value?:string): HTMLInputElement {
	const $input=document.createElement('input')
	$input.type='hidden'
	$input.name=name
	if (value!=null) $input.value=value
	return $input
}
