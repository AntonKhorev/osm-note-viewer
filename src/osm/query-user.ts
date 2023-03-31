import type {ApiUrlLister, WebUrlLister} from '../net'

export type UsernameQuery = {
	type: 'name'
	username: string
}

export type UidQuery = {
	type: 'id'
	uid: number
}

export type ValidUserQuery = UsernameQuery | UidQuery

export type InvalidUserQuery = {
	type: 'invalid'
	message: string
}

export type EmptyUserQuery = {
	type: 'empty'
}

export type UserQuery = ValidUserQuery | InvalidUserQuery | EmptyUserQuery

export function toUserQuery(apiUrlLister: ApiUrlLister, webUrlLister: WebUrlLister, value: string): UserQuery {
	const s=value.trim()
	if (s=='') return {
		type: 'empty'
	}
	if (s[0]=='#') {
		let match: RegExpMatchArray | null
		if (match=s.match(/^#\s*(\d+)$/)) {
			const [,uid]=match
			return {
				type: 'id',
				uid: Number(uid)
			}
		} else if (match=s.match(/^#\s*\d*(.)/)) {
			const [,c]=match
			return {
				type: 'invalid',
				message: `uid cannot contain non-digits, found ${c}`
			}
		} else {
			return {
				type: 'invalid',
				message: `uid cannot be empty`
			}
		}
	}
	if (s.includes('/')) {
		const hosts=new Set<string>()
		for (const urlString of [apiUrlLister.url,...webUrlLister.urls]) {
			try {
				const url=new URL(urlString)
				hosts.add(url.host)
			} catch {}
		}
		try {
			const url=new URL(s)
			if (!hosts.has(url.host)) {
				let domainString=`was given ${url.host}`
				if (!url.host) domainString=`no domain was given`
				return {
					type: 'invalid',
					message: `URL has to be of an OSM domain, ${domainString}`
				}
			}
			const [,typeDir]=url.pathname.split('/',2)
			if (typeDir=='user') {
				const [,,userDir]=url.pathname.split('/',3)
				if (!userDir) return {
					type: 'invalid',
					message: `OSM user URL has to include username`
				}
				return {
					type: 'name',
					username: decodeURIComponent(userDir)
				}
			} else if (typeDir=='api') {
				const [,,apiVersionDir,apiCall,apiValue]=url.pathname.split('/',5)
				if (apiVersionDir!='0.6' || apiCall!='user') return {
					type: 'invalid',
					message: `OSM API URL has to be "api/0.6/user/..."`
				}
				const [uidString]=apiValue.split('.')
				const uid=Number(uidString)
				if (!Number.isInteger(uid)) return {
					type: 'invalid',
					message: `OSM API URL has to include valid user id"`
				}
				return {
					type: 'id',
					uid
				}
			} else {
				return {
					type: 'invalid',
					message: `OSM URL has to be either user page or user api link`
				}
			}
		} catch {
			return {
				type: 'invalid',
				message: `string containing "/" character has to be a valid URL`
			}
		}
	}
	return {
		type: 'name',
		username: s
	}
}
