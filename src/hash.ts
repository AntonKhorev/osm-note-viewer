export function getHashSearchParams(): URLSearchParams {
	const paramString = (location.hash[0]=='#')
		? location.hash.slice(1)
		: location.hash
	return new URLSearchParams(paramString)
}

export function makeHrefWithCurrentHost(parameters: [k:string,v:string][]): string {
	const hostHashValue=getHashSearchParams().get('host')
	const parametersWithCurrentHost=[]
	if (hostHashValue) parametersWithCurrentHost.push(['host',hostHashValue])
	parametersWithCurrentHost.push(...parameters)
	return '#'+parametersWithCurrentHost.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')
}
