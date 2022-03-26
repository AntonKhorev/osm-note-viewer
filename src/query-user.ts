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

export function toUserQuery(value: string): UserQuery {
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
		try {
			const url=new URL(s)
			if (
				url.host=='www.openstreetmap.org' ||
				url.host=='openstreetmap.org' ||
				url.host=='www.osm.org' ||
				url.host=='osm.org'
			) {
				const [,userPathDir,userPathEnd]=url.pathname.split('/')
				if (userPathDir=='user' && userPathEnd) {
					const username=decodeURIComponent(userPathEnd)
					return {
						userType: 'name',
						username
					}
				}
				return {
					userType: 'invalid',
					message: `OSM URL has to include username`
				}
			} else if (url.host==`api.openstreetmap.org`) {
				const [,apiDir,apiVersionDir,apiCall,apiValue]=url.pathname.split('/')
				if (apiDir=='api' && apiVersionDir=='0.6' && apiCall=='user') {
					const [uidString]=apiValue.split('.')
					const uid=Number(uidString)
					if (Number.isInteger(uid)) return {
						userType: 'id',
						uid
					}
				}
				return {
					userType: 'invalid',
					message: `OSM API URL has to be "api/0.6/user/..."`
				}
			} else {
				let domainString=`was given ${url.host}`
				if (!url.host) domainString=`no domain was given`
				return {
					userType: 'invalid',
					message: `URL has to be of an OSM domain, ${domainString}`
				}
			}
		} catch {
			return {
				userType: 'invalid',
				message: `string containing / character has to be a valid URL`
			}
		}
	}
	return {
		userType: 'name',
		username: s
	}
}
