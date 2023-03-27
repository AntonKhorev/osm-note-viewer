import {checkAuthRedirectForInstallUri} from './redirect'

const installUri=`${location.protocol}//${location.host}${location.pathname}`

export function checkAuthRedirect() {
	return checkAuthRedirectForInstallUri(installUri)
}
