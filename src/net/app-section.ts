import type {ServerSelector} from '.'
import type Server from './server'
import type AuthStorage from './auth-storage'
import {p,ol,ul,li,em,strong,mark,code} from '../util/html-shortcuts'
import {makeElement, makeDiv, makeLink, makeLabel} from '../util/html'

export default class AppSection {
	onRegistrationUpdate?: ()=>void
	constructor(
		$section: HTMLElement,
		appName: string,
		oauthScope: string,
		authStorage: AuthStorage,
		server: Server,
		serverSelector: ServerSelector
	) {
		const app=()=>em(appName)
		const isSecureWebInstall=(
			location.protocol=='https:' ||
			location.protocol=='http:' && location.hostname=='127.0.0.1'
		)
		const $clientIdInput=document.createElement('input')
		$clientIdInput.id='auth-app-client-id'
		$clientIdInput.type='text'
		$clientIdInput.value=authStorage.clientId
		const manualCodeEntryLabel=`Manual authorization code entry`
		const $manualCodeEntryCheckbox=document.createElement('input')
		$manualCodeEntryCheckbox.id='auth-app-manual-code-entry'
		$manualCodeEntryCheckbox.type='checkbox'
		$manualCodeEntryCheckbox.checked=authStorage.isManualCodeEntry
		const $registrationNotice=makeDiv('notice')()
		const $useBuiltinRegistrationButton=makeElement('button')()(`Use the built-in registration`)
		const updateRegistrationNotice=()=>{
			$registrationNotice.replaceChildren()
			if (!server.oauthId) return
			$registrationNotice.append(
				`With `,makeLink(`the selected OSM server`,server.web.getUrl('')),`, `,
			)
			if (authStorage.installUri==server.oauthUrl || !server.oauthUrl) {
				$registrationNotice.append(
					app(),` has a built-in registration`
				)
				if (authStorage.installUri==server.oauthUrl) {
					const href=serverSelector.addServerSelectToAppInstallLocationHref(server,server.oauthUrl)
					$registrationNotice.append(
						` for `,
						makeLink(`its install location`,href)
					)
				}
				if (!authStorage.clientId) {
					$registrationNotice.append(
						` — `,$useBuiltinRegistrationButton
					)
				} else if (authStorage.clientId!=server.oauthId) {
					$registrationNotice.append(
						` but the current `,em(`client id`),` doesn't match it`,
						` — `,$useBuiltinRegistrationButton
					)
				} else {
					$registrationNotice.append(
						` which matches the current `,em(`client id`),` ✓`
					)
				}
			} else {
				const href=serverSelector.addServerSelectToAppInstallLocationHref(server,server.oauthUrl)
				$registrationNotice.append(
					app(),` has a built-in registration for `,
					makeLink(`a different install location`,href)
				)
			}
		}
		const $overallClientIdPresence=makeElement('span')()()
		const updateOverallClientIdPresence=()=>{
			$overallClientIdPresence.replaceChildren(authStorage.clientId
				? `you have it`
				: `you don't have it`
			)
		}
		updateOverallClientIdPresence()

		const onRegistrationInput=(...$inputs: HTMLInputElement[])=>{
			for (const $input of $inputs) {
				if ($input==$clientIdInput) {
					authStorage.clientId=$clientIdInput.value.trim()
					updateRegistrationNotice()
					updateOverallClientIdPresence()
				} else if ($input==$manualCodeEntryCheckbox) {
					authStorage.isManualCodeEntry=$manualCodeEntryCheckbox.checked
				}
			}
			this.onRegistrationUpdate?.()
		}
		const useBuiltinRegistration=()=>{
			if (!server.oauthId) return
			$clientIdInput.value=server.oauthId
			$manualCodeEntryCheckbox.checked=false
			onRegistrationInput($clientIdInput,$manualCodeEntryCheckbox)
		}
		$clientIdInput.oninput=()=>onRegistrationInput($clientIdInput)
		$manualCodeEntryCheckbox.oninput=()=>onRegistrationInput($manualCodeEntryCheckbox)
		$useBuiltinRegistrationButton.onclick=useBuiltinRegistration
		if (
			server.oauthId && !authStorage.clientId && 
			(authStorage.installUri==server.oauthUrl || !server.oauthUrl)
		) {
			useBuiltinRegistration()
		} else {
			updateRegistrationNotice()
		}

		const value=(text:string)=>{
			const $kbd=makeElement('kbd')('copy')(text)
			$kbd.onclick=()=>navigator.clipboard.writeText(text)
			return $kbd
		}
		const registrationDetails=(
			isOpen:boolean,
			redirectUri:string,isManualCodeEntry:boolean,
			summary:string,lead:(HTMLElement|string)[]
		):HTMLDetailsElement=>{
			const makeInputLink=($input:HTMLInputElement,...content:(string|HTMLElement)[])=>{
				const $anchor=document.createElement('a')
				$anchor.href='#'+$input.id
				$anchor.classList.add('input-link')
				$anchor.append(...content)
				$anchor.onclick=ev=>{
					ev.preventDefault()
					$input.focus()
				}
				return $anchor
			}
			const $details=makeElement('details')()(
				makeElement('summary')()(summary),
				...lead,
				ol(
					li(
						`Go to `,makeLink(`My Settings > OAuth 2 applications > Register new application`,server.web.getUrl(`oauth2/applications/new`)),
						` on `,em(server.host),`.`
					),li(
						`For `,em(`Name`),` enter anything that would help users to identify your copy of `,app(),`, for example, `,value(`${appName} @ ${authStorage.installUri}`),`. `,
						`Users will see this name on the authorization granting page and in their `,makeLink(`active authorizations list`,server.web.getUrl(`oauth2/authorized_applications`)),` after they log in here.`
					),li(
						`For `,em(`Redirect URIs`),` enter `,mark(value(redirectUri)),`.`
					),li(
						`Uncheck `,em(`Confidential application?`)
					),li(
						`In `,em(`Permissions`),` check:`,makePermissionsList(oauthScope)
					),li(
						`Click `,em(`Register`),`.`
					),li(
						`Copy the `,em(`Client ID`),` to `,makeInputLink($clientIdInput,`the input below`),`.`
					),li(
						`Don't copy the `,em(`Client Secret`),`. `,
						`You can write it down somewhere but it's going to be useless because `,app(),` is not a confidential app and can't keep secrets.`
					),li(
						mark(isManualCodeEntry?`Check`:`Uncheck`),` `,makeInputLink($manualCodeEntryCheckbox,em(manualCodeEntryLabel),` below`),`.`
					)
				),
				p(`After these steps you should be able to see `,app(),` with its client id and permissions in `,makeLink(`your client applications`,server.web.getUrl(`oauth2/applications`)),`.`),
			)
			if (isOpen) $details.open=true
			return $details
		}
		const $overallDetails=makeElement('details')()(
			makeElement('summary')()(
				`Only required if you want logins and don't have a `,em(`client id`),` (`,$overallClientIdPresence,`).`
			),
			p(
				`You have to get a `,em(`client id`),` if you want to run your own copy of `,app(),` and be able to perform actions requiring a login. `,
				`There are two possible app registration methods described below. `,
				`Their necessary steps are the same except for the `,mark(`marked`),` parts.`
			),
			registrationDetails(
				!authStorage.clientId && isSecureWebInstall,
				authStorage.installUri,false,
				`Instructions for setting up automatic logins`,[
					p(`This method sets up the most expected login workflow: login happens after the `,em(`Authorize`),` button is pressed.`),` `,
					p(`This method will only work when `,app(),` served over `,em(`https`),` or over `,em(`http`),` on localhost. `,...(isSecureWebInstall
						? [`This seems to be the case with your install.`]
						: [
							strong(`This doesn't seem to be the case with your install.`),` `,
							`If you register `,app(),` with this method, logins will likely fail after pressing the `,em(`Authorize`),` button. `,
							`Use the registration method with manual code entry described below or move `,app(),` to a secure web server.`
						]
					))
				]
			),
			registrationDetails(
				!authStorage.clientId && !isSecureWebInstall,
				authStorage.manualCodeUri,true,
				`Instructions for setting up logins where users have to copy the authorization code manually`,[
					p(`This sets up a less user-friendly login workflow: after pressing the `,em(`Authorize`),` an `,em(`Authorization code`),` appears that has to be copied into the `,em(`Authorization code`),` input below the login button on this page.`),` `,
					p(`This setup method is required when `,app(),` is not running on a secure web server. `,...(!isSecureWebInstall
						? [`This seems to be the case with your install.`]
						: [
							strong(`This doesn't seem to be the case with your install.`),` `,
							`You may still use this method but the one described before gives a simpler login workflow.`
						]
					))
				]
			),
			makeElement('details')()(
				makeElement('summary')()(`Additional instructions for building your own copy of `,app(),` with a registration included`),
				ol(
					li(
						`Register an OAuth 2 app with one of the methods described above.`
					),li(
						`Open `,code(`servers.json`),` in `,app(),`'s source code. `,
						`The format of this file is described here in `,em(`Custom server configuration syntax`),`.`
					),li(
						`If you're using a custom server specified on this page, copy its configuration to `,code(`servers.json`),`.`
					),li(
						`Find the `,code(`oauth`),` property corresponding to the server you're using or add one if it doesn't exist.`
					),li(
						`Copy the `,em(`Client ID`),` to the `,code(`id`),` property inside `,code(`oauth`),`.`
					),li(
						`If you're not using manual authorization code entry, copy `,app(),`'s install location (`,value(authStorage.installUri),`) to the `,code(`url`),` property inside `,code(`oauth`),`.`
					),li(
						`Rebuild `,app(),`.`
					)
				)
			),
			makeDiv('major-input-group')(
				makeLabel()(
					`Client ID `,$clientIdInput
				)
			),
			makeDiv('major-input-group')(
				makeLabel()(
					$manualCodeEntryCheckbox,` `+manualCodeEntryLabel
				),
				` (for non-https/non-secure install locations)`
			),
			$registrationNotice
		)
		$overallDetails.open=!authStorage.clientId
		$section.append(
			makeElement('h2')()(`Register app`),
			$overallDetails
		)
	}
}

// openstreetmap-website/config/locales/en.yml en.oauth.authorize.scopes
const oauthScopeNames: {[k:string]:string} = {
	read_prefs: `Read user preferences`,
	write_prefs: `Modify user preferences`,
	write_diary: `Create diary entries, comments and make friends`,
	write_api: `Modify the map`,
	read_gpx: `Read private GPS traces`,
	write_gpx: `Upload GPS traces`,
	write_notes: `Modify notes`,
}

function makePermissionsList(oauthScope: string): HTMLElement {
	return ul(
		...oauthScope.split(' ').map(s=>li(oauthScopeNames[s]))
	)
}
