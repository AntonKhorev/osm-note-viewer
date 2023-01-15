import NoteViewerStorage from './storage'
import Server from './server'
import {ol,ul,li,em} from './html-shortcuts'
import {makeElement, makeDiv, makeLink, makeLabel} from './html'

export default class Auth {
}

export class DummyAuth extends Auth {
	// TODO just clean up callback params
}

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
		const $input=document.createElement('input')
		$input.type='text'
		$input.value=storage.getString(`host[${server.host}].clientId`)
		$input.oninput=()=>{
			storage.setString(`host[${server.host}].clientId`,$input.value)
		}
		this.$appSection=makeElement('section')()(
			makeElement('h3')()(`Register app`),
			ol(
				li(
					`go to `,makeLink(`My Settings > OAuth 2 applications > Register new application`,server.getWebUrl(`oauth2/applications/new`)),
					` on `,em(server.host)
				),li(
					`for `,em(`Name`),` enter anything you like, for example, `,
					value(`osm-note-viewer installed at ${location.protocol}//${location.pathname}${location.search}`)
				),li(
					`for `,em(`Redirect URIs`),` enter `,
					value(`urn:ietf:wg:oauth:2.0:oob`)
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
			makeDiv('major-input')(
				makeLabel()(
					`Client ID: `,$input
				)
			)
		)
		this.$loginSection=makeElement('section')()(
			makeElement('h3')()(`Login`),
		)
	}
}
