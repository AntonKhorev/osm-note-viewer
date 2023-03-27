import type {ApiUrlLister, WebUrlLister} from './net/server'

export interface UsernameQuery {
	userType: 'name'
	username: string
}

export interface UidQuery {
	userType: 'id'
	uid: number
}

export type ValidUserQuery = UsernameQuery | UidQuery

export interface InvalidUserQuery {
	userType: 'invalid'
	message: string
}

export interface EmptyUserQuery {
	userType: 'empty'
}

export type UserQuery = ValidUserQuery | InvalidUserQuery | EmptyUserQuery

export function toUserQuery(urlLister: ApiUrlLister&WebUrlLister, value: string): UserQuery {
	const s=value.trim()
	if (s=='') return {
		userType: 'empty'
	}
	if (s[0]=='#') {
		let match: RegExpMatchArray | null
		if (match=s.match(/^#\s*(\d+)$/)) {
			const [,uid]=match
			return {
				userType: 'id',
				uid: Number(uid)
			}
		} else if (match=s.match(/^#\s*\d*(.)/)) {
			const [,c]=match
			return {
				userType: 'invalid',
				message: `uid cannot contain non-digits, found ${c}`
			}
		} else {
			return {
				userType: 'invalid',
				message: `uid cannot be empty`
			}
		}
	}
	if (s.includes('/')) {
		const hosts=new Set<string>()
		for (const urlString of [urlLister.api.url,...urlLister.web.urls]) {
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
					userType: 'invalid',
					message: `URL has to be of an OSM domain, ${domainString}`
				}
			}
			const [,typeDir]=url.pathname.split('/',2)
			if (typeDir=='user') {
				const [,,userDir]=url.pathname.split('/',3)
				if (!userDir) return {
					userType: 'invalid',
					message: `OSM user URL has to include username`
				}
				return {
					userType: 'name',
					username: decodeURIComponent(userDir)
				}
			} else if (typeDir=='api') {
				const [,,apiVersionDir,apiCall,apiValue]=url.pathname.split('/',5)
				if (apiVersionDir!='0.6' || apiCall!='user') return {
					userType: 'invalid',
					message: `OSM API URL has to be "api/0.6/user/..."`
				}
				const [uidString]=apiValue.split('.')
				const uid=Number(uidString)
				if (!Number.isInteger(uid)) return {
					userType: 'invalid',
					message: `OSM API URL has to include valid user id"`
				}
				return {
					userType: 'id',
					uid
				}
			} else {
				return {
					userType: 'invalid',
					message: `OSM URL has to be either user page or user api link`
				}
			}
		} catch {
			return {
				userType: 'invalid',
				message: `string containing "/" character has to be a valid URL`
			}
		}
	}
	return {
		userType: 'name',
		username: s
	}
}

export function makeUserQueryFromUserNameAndId(username: string|undefined|null, uid: number|undefined|null): UserQuery {
	if (username!=null) {
		return {
			userType: 'name',
			username
		}
	} else if (uid!=null && Number.isInteger(uid)) {
		return {
			userType: 'id',
			uid
		}
	} else {
		return {
			userType: 'empty'
		}
	}
}
