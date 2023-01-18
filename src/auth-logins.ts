import type AuthStorage from './auth-storage'
import type Server from './server'
import {
	makeElement, makeDiv, makeLink, makeLabel,
	hideElement, unhideElement, toggleHideElement, toggleUnhideElement,
	wrapFetch, wrapFetchForButton, makeGetKnownErrorMessage
} from './html'
import {em} from './html-shortcuts'

type AuthErrorData = {
	error_description: string
}
function isAuthErrorData(data:any): data is AuthErrorData {
	return (
		data &&
		typeof data == 'object' &&
		typeof data.error_description == 'string'
	)
}

type AuthTokenData = {
	access_token: string,
	scope: string
}
function isAuthTokenData(data:any): data is AuthTokenData {
	return (
		data &&
		typeof data == 'object' &&
		typeof data.access_token == 'string' &&
		typeof data.scope == 'string'
	)
}

type UserData = {
	user: {
		id: number,
		display_name: string
	}
}
function isUserData(data:any): data is UserData {
	return (
		data &&
		data.user &&
		typeof data.user == 'object' && 
		typeof data.user.id == 'number' &&
		typeof data.user.display_name == 'string'
	)
}

class AuthError extends TypeError {}

class AuthLoginForms {
	readonly $manualLoginForm=document.createElement('form')
	readonly $manualCodeForm=document.createElement('form')
	private readonly $clientIdHiddenInput=makeHiddenInput('client_id')
	private readonly $manualCodeInput=document.createElement('input')
	constructor(
		server: Server,
		manualCodeUri: string ,
		exchangeCodeForToken: (clientId:string,redirectUri:string,code:string)=>Promise<void>
	) {
		this.$manualLoginForm.target='_blank' // TODO popup window
		this.$manualLoginForm.action=server.getWebUrl('oauth2/authorize')
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

export default class AuthLoginSection {
	private readonly $clientIdRequired=makeDiv()(
		`Please register the app and enter the `,em(`client id`),` above to be able to login.`
	)
	private readonly loginForms: AuthLoginForms
	private readonly $logins=makeDiv()()
	constructor(
		$section: HTMLElement,
		private readonly authStorage: AuthStorage,
		server: Server,
		manualCodeUri: string
	) {
		const webPostUrlencoded=(webPath:string,headers:{[k:string]:string},parameters:[k:string,v:string][])=>server.webFetch(webPath,{
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				...headers
			},
			body: parameters.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')
		})
		const webPostUrlencodedWithPossibleAuthError=async(webPath:string,headers:{[k:string]:string},parameters:[k:string,v:string][],whenMessage:string)=>{
			const response=await webPostUrlencoded(webPath,headers,parameters)
			if (response.ok) return response
			let errorData: unknown
			try {
				errorData=await response.json()
			} catch {}
			if (isAuthErrorData(errorData)) {
				throw new AuthError(`Error ${whenMessage}: ${errorData.error_description}`)
			} else {
				throw new AuthError(`Error ${whenMessage} with unknown error format`)
			}
		}
		const fetchUserData=async(token:string):Promise<UserData>=>{
			const userResponse=await server.apiFetch(`user/details.json`,{
				headers: {
					Authorization: 'Bearer '+token
				}
			})
			if (!userResponse.ok) {
				throw new AuthError(`Error while getting user details`)
			}
			let userData: unknown
			try {
				userData=await userResponse.json() as unknown
			} catch {}
			if (!isUserData(userData)) {
				throw new AuthError(`Unexpected response format when getting user details`)
			}
			return userData
		}

		this.loginForms=new AuthLoginForms(server,manualCodeUri,async(clientId:string,redirectUri:string,code:string)=>{
			const tokenResponse=await webPostUrlencodedWithPossibleAuthError(`oauth2/token`,{},[
				['client_id',clientId],
				['redirect_uri',redirectUri],
				['grant_type','authorization_code'],
				['code',code]
			],`while getting a token`)
			let tokenData: unknown
			try {
				tokenData=await tokenResponse.json()
			} catch {}
			if (!isAuthTokenData(tokenData)) {
				throw new AuthError(`Unexpected response format when getting a token`)
			}
			const userData=await fetchUserData(tokenData.access_token)
			authStorage.setLogin(tokenData.access_token,{
				scope: tokenData.scope,
				uid: userData.user.id,
				username: userData.user.display_name
			})
			updateInResponseToLogin()
		})
		this.updateInResponseToAppRegistration()
		const updateInResponseToLogin=()=>{
			const logins=authStorage.getLogins()
			if (logins.size==0) {
				this.$logins.textContent=`No active logins. Use the form above to login if you'd like to manipulate notes.`
				return
			}
			const $table=document.createElement('table')
			$table.insertRow().append(
				makeElement('th')()(`user id`),
				makeElement('th')()(`username`),
				makeElement('th')()(),
				makeElement('th')()()
			)
			for (const [token,login] of logins) {
				const userHref=server.getWebUrl(`user/`+encodeURIComponent(login.username))
				const $updateButton=makeElement('button')()(`Update user info`)
				const $logoutButton=makeElement('button')()(`Logout`)
				$updateButton.onclick=()=>wrapFetchForButton($updateButton,async()=>{
					const userData=await fetchUserData(token)
					authStorage.setLogin(token,{
						...login,
						uid: userData.user.id,
						username: userData.user.display_name
					})
					updateInResponseToLogin()
				},makeGetKnownErrorMessage(AuthError))
				$logoutButton.onclick=()=>wrapFetchForButton($logoutButton,async()=>{
					await webPostUrlencodedWithPossibleAuthError(`oauth2/revoke`,{},[
						['token',token],
						// ['token_type_hint','access_token']
						['client_id',authStorage.clientId]
					],`while revoking a token`)
					authStorage.deleteLogin(token)
					updateInResponseToLogin()
				},makeGetKnownErrorMessage(AuthError))
				$table.insertRow().append(
					makeElement('td')()(String(login.uid)),
					makeElement('td')()(makeLink(login.username,userHref)),
					makeElement('td')()($updateButton),
					makeElement('td')()($logoutButton),
				)
			}
			this.$logins.replaceChildren($table)
		}
		updateInResponseToLogin()
		$section.append(
			makeElement('h3')()(`Logins`),
			this.$clientIdRequired,
			this.loginForms.$manualLoginForm,
			this.loginForms.$manualCodeForm,
			this.$logins
		)
	}
	updateInResponseToAppRegistration(): void {
		const clientId=this.authStorage.clientId
		this.loginForms.clientId=clientId
		const canLogin=!!clientId
		toggleHideElement(this.$clientIdRequired,canLogin)
		toggleUnhideElement(this.loginForms.$manualLoginForm,canLogin)
		toggleUnhideElement(this.$logins,canLogin)
	}
}

function makeHiddenInput(name:string,value?:string): HTMLInputElement {
	const $input=document.createElement('input')
	$input.type='hidden'
	$input.name=name
	if (value!=null) $input.value=value
	return $input
}
