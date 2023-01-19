import NoteViewerStorage from './storage'
import Server from './server'
import AuthStorage from './auth-storage'
import AuthLoginSection from './auth-login-section'
import {p,ol,ul,li,em,strong} from './html-shortcuts'
import {makeElement, makeDiv, makeLink, makeLabel} from './html'

export default abstract class Auth {
}

export class DummyAuth extends Auth {
	// TODO just clean up callback params
}

export class RealAuth extends Auth {
	$appSection: HTMLElement
	$loginSection=makeElement('section')()()
	constructor(storage: NoteViewerStorage, server: Server) {
		super()
		const authStorage=new AuthStorage(storage,server.host)
		const value=(text:string)=>{
			const $kbd=makeElement('kbd')('copy')(text)
			$kbd.onclick=()=>navigator.clipboard.writeText(text)
			return $kbd
		}
		const manualCodeUri=`urn:ietf:wg:oauth:2.0:oob`
		const installUrl=`${location.protocol}//${location.host}${location.pathname}`
		const app=()=>em(`osm-note-viewer`)

		// app section
		const registrationDetails=(isOpen:boolean,redirectUrl:string,summary:string,lead:(HTMLElement|string)[]):HTMLDetailsElement=>{
			const $details=makeElement('details')()(
				makeElement('summary')()(summary),
				...lead,
				ol(
					li(
						`Go to `,makeLink(`My Settings > OAuth 2 applications > Register new application`,server.getWebUrl(`oauth2/applications/new`)),
						` on `,em(server.host),`.`
					),li(
						`For `,em(`Name`),` enter anything you like, for example, `,
						value(`osm-note-viewer @ ${installUrl}`),`. `,
						`Users will be able to find `,app(),` by this name in their `,makeLink(`authorizations`,server.getWebUrl(`oauth2/authorized_applications`)),` after they log in here.`
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
		this.$appSection=makeElement('section')()(
			makeElement('h3')()(`Register app`),
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

		const loginSection=new AuthLoginSection(this.$loginSection,authStorage,server,manualCodeUri)

		// event listeners
		$clientIdInput.oninput=()=>{
			authStorage.clientId=$clientIdInput.value.trim()
			loginSection.updateInResponseToAppRegistration()
		}
	}
}
