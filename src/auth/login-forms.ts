import {
	makeElement, makeDiv, makeLabel,
	hideElement, unhideElement,
	wrapFetch, makeGetKnownErrorMessage
} from '../html'
import {p,em} from '../html-shortcuts'

export class AuthError extends TypeError {}

export default class AuthLoginForms {
	private readonly $manualCodeForm=document.createElement('form')
	private readonly $manualLoginButton=makeElement('button')()(`Login`)
	private readonly $cancelManualLoginButton=makeElement('button')()(`Cancel login`)
	private readonly $manualCodeInput=document.createElement('input')
	private codeVerifier?: string
	private loginWindow?: Window
	constructor(
		$container: HTMLElement,
		requestCode: (codeChallenge:string)=>Window|null,
		exchangeCodeForToken: (code:string,codeVerifier:string)=>Promise<void>
	) {
		this.$manualCodeInput.type='text'
		this.$manualCodeInput.required=true
		const $manualCodeButton=document.createElement('button')
		$manualCodeButton.textContent=`Login with the authorization code`
		const $manualCodeError=makeDiv('notice')()
		this.stopWaitingForCode()

		this.$manualLoginButton.onclick=async()=>{
			this.waitForCode()
			if (this.codeVerifier!=null) {
				this.loginWindow=requestCode(await getChallenge(this.codeVerifier))??undefined
			}
			if (this.codeVerifier==null || this.loginWindow==null) {
				this.stopWaitingForCode() // shouldn't happen
			}
		}
		this.$cancelManualLoginButton.onclick=()=>{
			this.stopWaitingForCode()
		}
		this.$manualCodeForm.onsubmit=(ev)=>wrapFetch($manualCodeButton,async()=>{
			ev.preventDefault()
			if (this.codeVerifier!=null) {
				await exchangeCodeForToken(this.$manualCodeInput.value.trim(),this.codeVerifier)
			}
			this.stopWaitingForCode()
		},makeGetKnownErrorMessage(AuthError),$manualCodeError,message=>$manualCodeError.textContent=message)

		// TODO write that you may not get a confirmation page if you are already logged in - in this case logout first
		//	^ to do this, need to check if anything user-visible appears in the popup at all with auto-code registrations
		const app=()=>em(`osm-note-viewer`)
		this.$manualCodeForm.append(
			p(`If the manual code copying method was used to register `,app(),`, copy the code into the input below.`),
			makeDiv('major-input')(
				makeLabel()(`Authorization code: `,this.$manualCodeInput)
			),makeDiv('major-input')(
				$manualCodeButton
			),$manualCodeError
		)
		$container.append(
			makeDiv('major-input')(
				this.$manualLoginButton,
				this.$cancelManualLoginButton
			),
			this.$manualCodeForm
		)
	}
	private waitForCode() {
		this.codeVerifier=getVerifier()
		hideElement(this.$manualLoginButton)
		unhideElement(this.$cancelManualLoginButton)
		unhideElement(this.$manualCodeForm)
	}
	stopWaitingForCode() {
		this.loginWindow?.close()
		this.loginWindow=undefined
		this.codeVerifier=undefined
		unhideElement(this.$manualLoginButton)
		hideElement(this.$cancelManualLoginButton)
		hideElement(this.$manualCodeForm)
		this.$manualCodeInput.value=''
	}
}

function getVerifier():string {
	const byteLength=48 // verifier string length == byteLength * 8/6
	return base64url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

async function getChallenge(verifier:string):Promise<string> {
	const verifierArray=new TextEncoder().encode(verifier)
	const challengeBuffer=await crypto.subtle.digest('SHA-256',verifierArray)
	return base64url(new Uint8Array(challengeBuffer))
}

function base64url(bytes:Uint8Array):string { // https://www.rfc-editor.org/rfc/rfc4648#section-5
	const string=String.fromCharCode(...bytes)
	return btoa(string).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
}
