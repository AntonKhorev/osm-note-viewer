import type Server from '../net/server'
import type AuthStorage from './storage'
import type {Login} from './storage'
import AuthLoginForms, {AuthError} from './login-forms'
import RadioTable from '../radio-table'
import {
	makeElement, makeDiv,
	wrapFetchForButton, makeGetKnownErrorMessage,
	bubbleEvent
} from '../util/html'
import {em} from '../util/html-shortcuts'
import {isArrayOfStrings} from '../types'

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
		display_name: string,
		roles?: string[]
	}
}
function isUserData(data:any): data is UserData {
	return (
		data &&
		data.user &&
		typeof data.user == 'object' && 
		typeof data.user.id == 'number' &&
		typeof data.user.display_name == 'string' &&
		hasCorrectRoles(data.user.roles)
	)
	function hasCorrectRoles(roles:unknown): boolean {
		if (roles===undefined) return true
		return isArrayOfStrings(roles)
	}
}

function makeLogin(scope: string, userData: Readonly<UserData>): Login {
	const login: Login = {
		scope,
		uid: userData.user.id,
		username: userData.user.display_name
	}
	if (userData.user.roles) login.roles=userData.user.roles
	return login
}

export default class AuthLoginSection {
	private readonly $clientIdRequired=makeDiv('notice')(
		`Please register the app and enter the `,em(`client id`),` below to be able to login.`
	)
	private readonly $loginForms=makeDiv()()
	private readonly loginForms: AuthLoginForms
	private readonly $logins=makeDiv()()
	constructor(
		private readonly $section: HTMLElement,
		private readonly authStorage: AuthStorage,
		server: Server
	) {
		const webPostUrlencodedWithPossibleAuthError=async(webPath:string,parameters:[k:string,v:string][],whenMessage:string)=>{
			const response=await server.web.fetch.withUrlencodedBody(parameters).post(webPath)
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
			const userResponse=await server.api.fetch.withToken(token)(`user/details.json`)
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

		const switchToToken=(token:string)=>{
			authStorage.token=token
			bubbleEvent($section,'osmNoteViewer:loginChange')
		}
		const updateInResponseToLogin=()=>{
			const logins=authStorage.getLogins()
			if (logins.size==0) {
				this.$logins.textContent=`No active logins. Use the form above to login if you'd like to manipulate notes.`
				return
			}
			const loginTable=new RadioTable('login',[
				[['number'],[`user id`]],
				[[],[`username`]],
				[['capability'],[`profile`]],
				[['capability'],[`moderator`]],
			])
			loginTable.addRow(($radio)=>{
				$radio.checked=!authStorage.token
				$radio.onclick=()=>{
					switchToToken('')
				}
				const $usernameLabel=makeElement('label')()(em(`anonymous`))
				$usernameLabel.htmlFor=$radio.id
				return [
					[],
					[$usernameLabel]
				]
			})
			for (const [token,login] of logins) {
				const userHref=server.web.getUrl(`user/`+encodeURIComponent(login.username))
				const $updateButton=makeElement('button')()(`Update user info`)
				const $logoutButton=makeElement('button')()(`Logout`)
				$updateButton.onclick=()=>wrapFetchForButton($updateButton,async()=>{
					const userData=await fetchUserData(token)
					authStorage.setLogin(token,makeLogin(login.scope,userData))
					updateInResponseToLogin()
				},makeGetKnownErrorMessage(AuthError))
				$logoutButton.onclick=()=>wrapFetchForButton($logoutButton,async()=>{
					await webPostUrlencodedWithPossibleAuthError(`oauth2/revoke`,[
						['token',token],
						// ['token_type_hint','access_token']
						['client_id',authStorage.clientId]
					],`while revoking a token`)
					authStorage.deleteLogin(token)
					if (authStorage.token==token) {
						switchToToken('')
					}
					updateInResponseToLogin()
				},makeGetKnownErrorMessage(AuthError))
				loginTable.addRow(($radio)=>{
					$radio.checked=authStorage.token==token
					$radio.onclick=()=>{
						switchToToken(token)
					}
					const $uidLabel=makeElement('label')()(String(login.uid))
					const $usernameLabel=makeElement('label')()(login.username)
					$uidLabel.htmlFor=$usernameLabel.htmlFor=$radio.id
					return [
						[$uidLabel],
						[$usernameLabel],
						userHref,
						login.roles?.includes('moderator'),
						[$updateButton],
						[$logoutButton],
					]
				})
			}
			this.$logins.replaceChildren(loginTable.$table)
		}

		this.loginForms=new AuthLoginForms(this.$loginForms,authStorage.isManualCodeEntry,(codeChallenge:string)=>{
			return server.web.getUrl('oauth2/authorize')+'?'+[
				['client_id',authStorage.clientId],
				['redirect_uri',authStorage.redirectUri],
				['scope','read_prefs write_notes'],
				['response_type','code'],
				['code_challenge',codeChallenge],
				['code_challenge_method','S256']
			].map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')
		},async(code:string,codeVerifier:string)=>{
			const tokenResponse=await webPostUrlencodedWithPossibleAuthError(`oauth2/token`,[
				['client_id',authStorage.clientId],
				['redirect_uri',authStorage.redirectUri],
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
			authStorage.setLogin(tokenData.access_token,makeLogin(tokenData.scope,userData))
			switchToToken(tokenData.access_token)
			updateInResponseToLogin()
		})
		this.updateVisibility()
		updateInResponseToLogin()
		$section.append(
			makeElement('h2')()(`Logins`),
			this.$clientIdRequired,
			this.$loginForms,
			this.$logins
		)
	}
	respondToAppRegistration(): void {
		this.loginForms.respondToAppRegistration(this.authStorage.isManualCodeEntry)
		this.updateVisibility()
	}
	focusOnLogin(): void {
		this.$section.scrollIntoView()
		if (!this.$loginForms.hidden && !this.loginForms.$loginButton.hidden) {
			this.loginForms.$loginButton.focus()
		}
	}
	private updateVisibility(): void {
		const canLogin=!!this.authStorage.clientId
		this.$clientIdRequired.hidden=canLogin
		this.$loginForms.hidden=!canLogin
		this.$logins.hidden=!canLogin
	}
}
