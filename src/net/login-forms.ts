import {
	makeElement, makeDiv, makeLabel,
	wrapFetch, makeGetKnownErrorMessage
} from '../util/html'
import {p,em} from '../util/html-shortcuts'

export class AuthError extends TypeError {}

export default class LoginForms {
	readonly $loginButton=makeElement('button')()(`Login`)
	private readonly $cancelLoginButton=makeElement('button')()(`Cancel login`)
	private readonly $manualCodeForm=document.createElement('form')
	private readonly $manualCodeButton=document.createElement('button')
	private readonly $manualCodeInput=document.createElement('input')
	private readonly $error=makeDiv('notice')()
	private loginWindow?: Window
	constructor(
		$container: HTMLElement,
		appName: string,
		private isManualCodeEntry: boolean,
		getRequestCodeUrl: (codeChallenge:string)=>string,
		exchangeCodeForToken: (code:string,codeVerifier:string)=>Promise<void>
	) {
		this.$manualCodeInput.type='text'
		this.$manualCodeInput.required=true
		this.$manualCodeButton.textContent=`Login with the authorization code`
		this.stopWaitingForAuthorization()

		this.$loginButton.onclick=async()=>{
			const codeVerifier=getCodeVerifier()
			const codeChallenge=await getCodeChallenge(codeVerifier)
			const width=600
			const height=600
			const loginWindow=open(getRequestCodeUrl(codeChallenge),'_blank',
				`width=${width},height=${height},left=${screen.width/2-width/2},top=${screen.height/2-height/2}`
			)
			if (loginWindow==null) return
			this.waitForAuthorization(loginWindow,code=>exchangeCodeForToken(code,codeVerifier))
		}
		this.$cancelLoginButton.onclick=()=>{
			this.stopWaitingForAuthorization()
		}
		window.addEventListener('beforeunload',()=>{
			this.stopWaitingForAuthorization()
		})

		// TODO write that you may not get a confirmation page if you are already logged in - in this case logout first
		//	^ to do this, need to check if anything user-visible appears in the popup at all with auto-code registrations
		const app=()=>em(appName)
		this.$manualCodeForm.append(
			p(`If the manual code copying method was used to register `,app(),`, copy the code into the input below.`),
			makeDiv('major-input-group')(
				makeLabel()(`Authorization code `,this.$manualCodeInput)
			),makeDiv('major-input-group')(
				this.$manualCodeButton
			)
		)
		$container.append(
			makeDiv('major-input-group')(
				this.$loginButton,
				this.$cancelLoginButton
			),
			this.$manualCodeForm,
			this.$error
		)
	}
	respondToAppRegistration(isManualCodeEntry:boolean) {
		this.isManualCodeEntry=isManualCodeEntry
		this.stopWaitingForAuthorization()
		this.clearError()
	}
	private waitForAuthorization(loginWindow:Window,submitCode:(code:string)=>Promise<void>) {
		const wrapAction=(action:()=>Promise<void>)=>wrapFetch(
			this.$manualCodeButton,
			action,
			makeGetKnownErrorMessage(AuthError),this.$error,message=>this.$error.textContent=message
		)
		if (this.isManualCodeEntry) {
			this.$manualCodeForm.onsubmit=async(ev)=>{
				ev.preventDefault()
				await wrapAction(async()=>{
					await submitCode(this.$manualCodeInput.value.trim())
					this.stopWaitingForAuthorization() // keep the login popup on error in case user copied the code incorrectly
				})
			}
		} else {
			(<any>window).receiveOsmAuthCode=async(code:unknown)=>{
				await wrapAction(async()=>{
					if (typeof code != 'string') {
						throw new AuthError(`Unexpected code parameter type received from popup window`)
					}
					await submitCode(code)
				})
				this.stopWaitingForAuthorization()
			}
			(<any>window).receiveOsmAuthDenial=async(errorDescription:unknown)=>{
				await wrapAction(async()=>{
					throw new AuthError(typeof errorDescription == 'string'
						? errorDescription
						: `Unknown authorization error`
					)
				})
				this.stopWaitingForAuthorization()
			}
		}
		this.loginWindow=loginWindow
		this.$loginButton.hidden=true
		this.$cancelLoginButton.hidden=false
		this.$manualCodeForm.hidden=!this.isManualCodeEntry
		if (this.isManualCodeEntry) {
			this.$manualCodeInput.focus()
		}
		this.clearError()
	}
	private stopWaitingForAuthorization() {
		this.$manualCodeForm.onsubmit=(ev)=>ev.preventDefault()
		delete (<any>window).receiveOsmAuthCode
		delete (<any>window).receiveOsmAuthDenial
		this.loginWindow?.close()
		this.loginWindow=undefined
		this.$loginButton.hidden=false
		this.$cancelLoginButton.hidden=true
		this.$manualCodeForm.hidden=true
		this.$manualCodeInput.value=''
	}
	private clearError() {
		this.$error.replaceChildren()
	}
}

function getCodeVerifier():string {
	const byteLength=48 // verifier string length == byteLength * 8/6
	return encodeBase64url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

async function getCodeChallenge(codeVerifier:string):Promise<string> {
	const codeVerifierArray=new TextEncoder().encode(codeVerifier)
	const codeChallengeBuffer=await crypto.subtle.digest('SHA-256',codeVerifierArray)
	return encodeBase64url(new Uint8Array(codeChallengeBuffer))
}

function encodeBase64url(bytes:Uint8Array):string { // https://www.rfc-editor.org/rfc/rfc4648#section-5
	const string=String.fromCharCode(...bytes)
	return btoa(string).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
}
