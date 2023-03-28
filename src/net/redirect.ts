import {makeDiv, makeLink} from '../util/html'
import {em} from '../util/html-shortcuts'

interface AuthOpener {
	receiveOsmNoteViewerAuthCode(code:unknown):unknown
	receiveOsmNoteViewerAuthDenial(errorDescription:unknown):unknown
}
function isAuthOpener(o:any): o is AuthOpener {
	return (
		o && typeof o == 'object' &&
		typeof o.receiveOsmNoteViewerAuthCode == 'function' &&
		typeof o.receiveOsmNoteViewerAuthDenial == 'function'
	)
}

export function checkAuthRedirectForInstallUri(appName: string, installUri: string): boolean {
	const app=()=>em(appName)
	const params=new URLSearchParams(location.search)
	const code=params.get('code')
	const error=params.get('error')
	const errorDescription=params.get('error_description')
	if (code==null && error==null) {
		return false
	}
	if (!isAuthOpener(window.opener)) {
		document.body.append(makeDiv('notice')(
			`This is the location of authentication redirect for `,app(),`. `,
			`It is expected to be opened in a popup window when performing a login. `,
			`Instead it is opened outside of a popup and cannot function properly. `,
			`If you want to continue using `,app(),`, please open `,makeLink(`this link`,installUri),`.`
		))
	} else if (code!=null) {
		window.opener.receiveOsmNoteViewerAuthCode(code)
	} else if (error!=null) {
		window.opener.receiveOsmNoteViewerAuthDenial(errorDescription??error)
	}
	return true
}
