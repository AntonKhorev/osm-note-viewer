export function checkAuthRedirectForInstallUri(): boolean {
	const params=new URLSearchParams(location.search)
	const code=params.get('code')
	const error=params.get('error')
	const errorDescription=params.get('error_description')
	if (code==null && error==null) {
		return false
	}

	if (code!=null) {
		new BroadcastChannel(`osm-note-viewer-oauth-grant`).postMessage({
			type: 'code',
			code
		})
	} else if (error!=null) {
		new BroadcastChannel(`osm-note-viewer-oauth-grant`).postMessage({
			type: 'error',
			errorDescription: errorDescription??error
		})
	}
	close()
	return true
}
