import {makeDiv, makeLink} from '../util/html'

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

export function checkAuthRedirectForInstallUri(installUri: string): boolean {
	const params=new URLSearchParams(location.search)
	const code=params.get('code')
	const error=params.get('error')
	const errorDescription=params.get('error_description')
	if (code==null && error==null) {
		return false
	}
	if (!isAuthOpener(window.opener)) {
		document.body.append(makeDiv('notice')(
			`You opened the location of note-viewer's authentication redirect for a popup window outside of a popup window. `,
			`If you want to continue using note-viewer, please open `,makeLink(`this link`,installUri),`.`
		))
	} else if (code!=null) {
		window.opener.receiveOsmNoteViewerAuthCode(code)
	} else if (error!=null) {
		window.opener.receiveOsmNoteViewerAuthDenial(errorDescription??error)
	}
	return true
}
