import type AuthStorage from './auth-storage'
import AuthLoginForms, {AuthError} from './auth-login-forms'
import type Server from './server'
import {
	makeElement, makeDiv, makeLink,
	toggleHideElement, toggleUnhideElement,
	wrapFetchForButton, makeGetKnownErrorMessage
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

export default class AuthLoginSection {
	private readonly $clientIdRequired=makeDiv()(
		`Please register the app and enter the `,em(`client id`),` above to be able to login.`
	)
	private readonly $loginForms=makeDiv()()
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

		// server.getWebUrl('oauth2/authorize'),manualCodeUri
		this.loginForms=new AuthLoginForms(this.$loginForms,(codeChallenge:string)=>{
			open(server.getWebUrl('oauth2/authorize')+'?'+[
				['client_id',authStorage.clientId],
				['redirect_uri',manualCodeUri],
				['scope','read_prefs write_notes'],
				['response_type','code'],
				['code_challenge',codeChallenge],
				['code_challenge_method','S256']
			].map(([k,v])=>k+'='+encodeURIComponent(v)).join('&'),'_blank')
			// TODO popup window
		},async(code:string,codeVerifier:string)=>{
			const tokenResponse=await webPostUrlencodedWithPossibleAuthError(`oauth2/token`,{},[
				['client_id',authStorage.clientId],
				['redirect_uri',manualCodeUri],
				['grant_type','authorization_code'],
				['code',code],
				['code_verifier',codeVerifier]
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
			this.$loginForms,
			this.$logins
		)
	}
	updateInResponseToAppRegistration(): void {
		this.loginForms.stopWaitingForCode()
		const canLogin=!!this.authStorage.clientId
		toggleHideElement(this.$clientIdRequired,canLogin)
		toggleUnhideElement(this.$loginForms,canLogin)
		toggleUnhideElement(this.$logins,canLogin)
	}
}
