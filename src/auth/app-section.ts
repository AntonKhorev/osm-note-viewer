import type Server from '../server'
import type AuthStorage from './storage'
import {p,ol,ul,li,em,strong} from '../html-shortcuts'
import {makeElement, makeDiv, makeLink, makeLabel} from '../html'

export default class AuthAppSection {
	onRegistrationUpdate?: ()=>void
	constructor(
		$section: HTMLElement,
		authStorage: AuthStorage,
		server: Server,
		manualCodeUri: string
	) {
		const installUrl=`${location.protocol}//${location.host}${location.pathname}`
		const app=()=>em(`osm-note-viewer`)
		const value=(text:string)=>{
			const $kbd=makeElement('kbd')('copy')(text)
			$kbd.onclick=()=>navigator.clipboard.writeText(text)
			return $kbd
		}
		const registrationDetails=(isOpen:boolean,redirectUrl:string,summary:string,lead:(HTMLElement|string)[]):HTMLDetailsElement=>{
			const $details=makeElement('details')()(
				makeElement('summary')()(summary),
				...lead,
				ol(
					li(
						`Go to `,makeLink(`My Settings > OAuth 2 applications > Register new application`,server.getWebUrl(`oauth2/applications/new`)),
						` on `,em(server.host),`.`
					),li(
						`For `,em(`Name`),` enter anything that would help users to identify your copy of `,app(),`, for example, `,value(`osm-note-viewer @ ${installUrl}`),`. `,
						`Users will see this name on the authorization granting page and in their `,makeLink(`active authorizations list`,server.getWebUrl(`oauth2/authorized_applications`)),` after they log in here.`
					),li(
						`For `,em(`Redirect URIs`),` enter `,
						value(redirectUrl),`.`
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
						`Copy the `,em(`Client ID`),` to an input below.`
					),li(
						`Don't copy the `,em(`Client Secret`),`. `,
						`You can write it down somewhere but it's going to be useless because `,app(),` is not a confidential app and can't keep secrets.`
					)
				),
				p(`After these steps you should be able to see `,app(),` in `,makeLink(`your client applications`,server.getWebUrl(`oauth2/applications`)),` and copy its client id from there.`),
			)
			if (isOpen) $details.open=true
			return $details
		}
		const clientId=authStorage.clientId
		const isSecureWebInstall=(
			location.protocol=='https:' ||
			location.protocol=='http:' && location.hostname=='127.0.0.1'
		)
		const $clientIdInput=document.createElement('input')
		$clientIdInput.type='text'
		$clientIdInput.value=clientId
		$section.append(
			makeElement('h3')()(`Register app`),
			p(
				`Only required if you don't yet have a `,em(`client id`),`. `,
				`You have to get a `,em(`client id`),` if you want to run your own copy of `,app(),` and be able to manipulate notes from it.`
			),
			registrationDetails(
				!clientId && isSecureWebInstall,
				installUrl,
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
				manualCodeUri,
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
			)
		)
		$clientIdInput.oninput=()=>{
			authStorage.clientId=$clientIdInput.value.trim()
			this.onRegistrationUpdate?.()
		}
	}
}
