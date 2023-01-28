import type Server from '../server'
import type AuthStorage from './storage'
import {p,ol,ul,li,em,strong,mark} from '../html-shortcuts'
import {makeElement, makeDiv, makeLink, makeLabel} from '../html'

const app=()=>em(`osm-note-viewer`)

export default class AuthAppSection {
	onRegistrationUpdate?: ()=>void
	constructor(
		$section: HTMLElement,
		authStorage: AuthStorage,
		server: Server
	) {
		const clientId=authStorage.clientId
		const isSecureWebInstall=(
			location.protocol=='https:' ||
			location.protocol=='http:' && location.hostname=='127.0.0.1'
		)
		const $clientIdInput=document.createElement('input')
		$clientIdInput.id='auth-app-client-id'
		$clientIdInput.type='text'
		$clientIdInput.value=clientId
		const manualCodeEntryLabel=`Manual authorization code entry`
		const $manualCodeEntryCheckbox=document.createElement('input')
		$manualCodeEntryCheckbox.id='auth-app-manual-code-entry'
		$manualCodeEntryCheckbox.type='checkbox'
		$manualCodeEntryCheckbox.checked=authStorage.isManualCodeEntry
		const $registrationNotice=makeDiv('notice')()
		const $useBuiltinRegistrationButton=makeElement('button')()(`Use the built-in registration`)
		const updateRegistrationNotice=()=>{
			$registrationNotice.replaceChildren()
			if (authStorage.installUri==server.oauthUrl) {
				$registrationNotice.append(
					`On `,makeLink(`the current server`,server.web.getUrl('')),`, `,
					app(),` has a built-in registration for `,makeLink(`its install location`,authStorage.installUri)
				)
				if (authStorage.clientId=='') {
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
			}
		}
		updateRegistrationNotice()
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
						`For `,em(`Name`),` enter anything that would help users to identify your copy of `,app(),`, for example, `,value(`osm-note-viewer @ ${authStorage.installUri}`),`. `,
						`Users will see this name on the authorization granting page and in their `,makeLink(`active authorizations list`,server.web.getUrl(`oauth2/authorized_applications`)),` after they log in here.`
					),li(
						`For `,em(`Redirect URIs`),` enter `,mark(value(redirectUri)),`.`
					),li(
						`Uncheck `,em(`Confidential application?`)
					),li(
						`In `,em(`Permissions`),` check:`,ul(
							li(`Read user preferences`),
							li(`Modify notes`)
						)
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
		$section.append(
			makeElement('h3')()(`Register app`),
			p(
				`Only required if you don't yet have a `,em(`client id`),`. `,
				`You have to get a `,em(`client id`),` if you want to run your own copy of `,app(),` and be able to manipulate notes from it. `,
				`There are two possible app registration methods described below. `,
				`Their necessary steps are the same except for the `,mark(`marked`),` parts.`
			),
			registrationDetails(
				!clientId && isSecureWebInstall,
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
				!clientId && !isSecureWebInstall,
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
			makeDiv('major-input')(
				makeLabel()(
					`Client ID: `,$clientIdInput
				)
			),
			makeDiv('major-input')(
				makeLabel()(
					$manualCodeEntryCheckbox,` `+manualCodeEntryLabel
				)
			),
			$registrationNotice
		)
		const onRegistrationInput=(...$inputs: HTMLInputElement[])=>{
			for (const $input of $inputs) {
				if ($input==$clientIdInput) {
					authStorage.clientId=$clientIdInput.value.trim()
					updateRegistrationNotice()
				} else if ($input==$manualCodeEntryCheckbox) {
					authStorage.isManualCodeEntry=$manualCodeEntryCheckbox.checked
				}
			}
			this.onRegistrationUpdate?.()
		}
		$clientIdInput.oninput=()=>onRegistrationInput($clientIdInput)
		$manualCodeEntryCheckbox.oninput=()=>onRegistrationInput($manualCodeEntryCheckbox)
		$useBuiltinRegistrationButton.onclick=()=>{
			if (!server.oauthId) return
			$clientIdInput.value=server.oauthId
			$manualCodeEntryCheckbox.checked=true
			onRegistrationInput($clientIdInput,$manualCodeEntryCheckbox)
		}
	}
}
