import NoteViewerStorage from './storage'
import Server from './server'
import {p,ol,ul,li,em} from './html-shortcuts'
import {makeElement, makeDiv, makeLink, makeLabel, toggleHideElement, toggleUnhideElement} from './html'

export default abstract class Auth {
}

export class DummyAuth extends Auth {
	// TODO just clean up callback params
}

type Login = {
	scope: string,
	uid: number,
	username: string
}
function isLogin(data:any): data is Login {
	return (
		data && 
		typeof data == 'object' &&
		typeof data.scope == 'string' &&
		typeof data.uid == 'number' &&
		typeof data.username == 'string'
	)
}

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
		const getLogins=():Map<string,Login>=>{
			const logins=new Map<string,Login>
			const loginsString=storage.getItem(`host[${server.host}].logins`)
			if (loginsString==null) return logins
			let loginsArray: unknown
			try {
				loginsArray=JSON.parse(loginsString)
			} catch {}
			if (!Array.isArray(loginsArray)) return logins
			for (const loginsArrayEntry of loginsArray) {
				if (!Array.isArray(loginsArrayEntry)) continue
				const [token,login]=loginsArrayEntry
				if (typeof token != 'string') continue
				if (!isLogin(login)) continue
				logins.set(token,login)
			}
			return logins
		}
		const setLogin=(token:string,login:Login)=>{
			const logins=getLogins()
			logins.set(token,login)
			storage.setItem(`host[${server.host}].logins`,JSON.stringify([...logins.entries()]))
		}

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
					value(`osm-note-viewer @ ${location.protocol}//${location.pathname}${location.search}`)
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
		const $manualCodeError=makeDiv('notice','error')()
		const $logins=makeDiv()()
		$manualCodeForm.append(
			makeDiv('major-input')(
				makeLabel()(`Authorization code: `,$manualCodeInput)
			),makeDiv('major-input')(
				$manualCodeButton
			),$manualCodeError,$logins
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
		const updateLoginSectionInResponseToLogin=()=>{
			const logins=getLogins()
			if (logins.size==0) {
				$logins.textContent=`No active logins. Use the form above to login if you'd like to manipulate notes.`
				return
			}
			const $table=document.createElement('table')
			$table.insertRow().append(
				makeElement('th')()(`user id`),
				makeElement('th')()(`username`)
			)
			for (const [token,login] of logins) {
				const userHref=server.getWebUrl(`user/`+encodeURIComponent(login.username))
				$table.insertRow().append(
					makeElement('td')()(String(login.uid)),
					makeElement('td')()(makeLink(login.username,userHref))
				)
			}
			$logins.replaceChildren($table)
		}
		updateLoginSectionInResponseToLogin()
		this.$loginSection=makeElement('section')()(
			makeElement('h3')()(`Logins`),
			$clientIdRequired,
			$manualLoginForm,
			$manualCodeForm
		)

		// event listeners
		$clientIdInput.oninput=()=>{
			setClientId($clientIdInput.value.trim())
			updateLoginSectionInResponseToAppRegistration()
		}
		$manualCodeForm.onsubmit=async(ev)=>{
			ev.preventDefault()
			const parameters: [string,string][] = [
				['client_id',getClientId()],
				['redirect_uri',manualCodeUri],
				['grant_type','authorization_code'],
				['code',$manualCodeInput.value.trim()]
			]
			try {
				$manualCodeButton.disabled=true
				const tokenResponse=await server.webFetch(`oauth2/token`,{
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded'
					},
					body: parameters.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')
				})
				if (!tokenResponse.ok) {
					let errorData: unknown
					try {
						errorData=await tokenResponse.json()
					} catch {}
					if (isAuthErrorData(errorData)) {
						throw new AuthError(`Error while getting a token: ${errorData.error_description}`)
					} else {
						throw new AuthError(`Error while getting a token with unknown error format`)
					}
				}
				let tokenData: unknown
				try {
					tokenData=await tokenResponse.json()
				} catch {}
				if (!isAuthTokenData(tokenData)) {
					throw new AuthError(`Unexpected response format when getting a token`)
				}
				const userResponse=await server.apiFetch(`user/details.json`,{
					headers: {
						Authorization: 'Bearer '+tokenData.access_token
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
				setLogin(tokenData.access_token,{
					scope: tokenData.scope,
					uid: userData.user.id,
					username: userData.user.display_name
				})
				updateLoginSectionInResponseToLogin()
				$manualCodeError.textContent=''
			} catch (ex) {
				if (ex instanceof AuthError) {
					$manualCodeError.textContent=ex.message
				} else {
					$manualCodeError.textContent=`Unknown error ${ex}`
				}
			} finally {
				$manualCodeButton.disabled=false
			}
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
