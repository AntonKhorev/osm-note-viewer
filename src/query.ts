import {Note, NoteComment} from './data'

export interface UsernameQueryPart {
	userType: 'name'
	username: string
}

export interface UidQueryPart {
	userType: 'id'
	uid: number
}

export type ValidUserQueryPart = UsernameQueryPart | UidQueryPart

export interface InvalidUserQueryPart {
	userType: 'invalid'
	message: string
}

export type UserQueryPart = ValidUserQueryPart | InvalidUserQueryPart

export function toUserQueryPart(value: string): UserQueryPart {
	const s=value.trim()
	if (s=='') return {
		userType: 'invalid',
		message: `cannot be empty`
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
				return {
					userType: 'invalid',
					message: `URL has to be of an OSM domain, was given ${url.host}`
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

export type NoteQuery = ValidUserQueryPart & {
	status: 'mixed'|'recent'|'open'|'separate'
	sort: 'created_at'|'updated_at'
	order: 'newest'|'oldest'
	beganAt?: number
	endedAt?: number
}

export function toNoteQueryStatus(value: string): NoteQuery['status'] {
	if (value=='open' || value=='recent' || value=='separate') return value
	return 'mixed'
}

export function toNoteQuerySort(value: string): NoteQuery['sort'] {
	if (value=='updated_at') return value
	return 'created_at'
}

export function toNoteQueryOrder(value: string): NoteQuery['order'] {
	if (value=='oldest') return value
	return 'newest'
}

export interface NoteFetchDetails {
	parameters: string
	limit: number // to be (checked against result size for exit condition) and (passed as lastLimit on the next iteration)
}

/**
 * @returns fd.parameters - url parameters in this order: 
                            user OR display_name;
                            sort, order - these don't change within a query;
                            closed - this may change between phases;
                            limit - this may change within a phase in rare circumstances;
                            from, to - this change for pagination purposes, from needs to be present with a dummy date if to is used
 */
export function getNextFetchDetails(query: NoteQuery, requestedLimit: number, lastNote?: Note, prevLastNote?: Note, lastLimit?: number): NoteFetchDetails {
	let closed=-1
	if (query.status=='open') {
		closed=0
	} else if (query.status=='recent') {
		closed=7
	}
	let lowerDateLimit:string|undefined
	let upperDateLimit:string|undefined
	let limit=requestedLimit
	if (lastNote) {
		if (lastNote.comments.length<=0) throw new Error(`note #${lastNote.id} has no comments`)
		const lastDate=getTargetComment(lastNote).date
		if (query.order=='oldest') {
			lowerDateLimit=makeLowerLimit(lastDate)
		} else {
			upperDateLimit=makeUpperLimit(lastDate)
		}
		if (prevLastNote) {
			if (prevLastNote.comments.length<=0) throw new Error(`note #${prevLastNote.id} has no comments`)
			if (lastLimit==null) throw new Error(`no last limit provided along with previous last note #${prevLastNote.id}`)
			const prevLastDate=getTargetComment(prevLastNote).date
			if (lastDate==prevLastDate) {
				limit=lastLimit+requestedLimit
			}
		}
	}
	if (lowerDateLimit==null && upperDateLimit!=null) {
		lowerDateLimit='2001-01-01T00:00:00Z'
	}
	const parameters:Array<[string,string|number]>=[]
	if (query.userType=='id') {
		parameters.push(['user',query.uid])
	} else {
		parameters.push(['display_name',query.username])
	}
	parameters.push(
		['sort',query.sort],
		['order',query.order],
		['closed',closed],
		['limit',limit]
	)
	if (lowerDateLimit!=null) parameters.push(['from',lowerDateLimit])
	if (upperDateLimit!=null) parameters.push(['to',upperDateLimit])
	return {
		parameters: parameters.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&'),
		limit
	}
	function getTargetComment(note: Note): NoteComment {
		if (query.sort=='created_at') {
			return note.comments[0]
		} else {
			return note.comments[note.comments.length-1]
		}
	}
}

function makeLowerLimit(dateInSeconds: number): string {
	return makeISODateString(dateInSeconds)
}

function makeUpperLimit(dateInSeconds: number): string {
	return makeISODateString(dateInSeconds+1)
}

function makeISODateString(dateInSeconds: number): string {
	const dateObject=new Date(dateInSeconds*1000)
	const dateString=dateObject.toISOString()
	return dateString.replace(/.\d\d\dZ$/,'Z')
}
