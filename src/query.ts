import {Note, NoteComment} from './data'
import {UserQuery, toUserQuery} from './query-user'
import {toDateQuery, toUrlDate} from './query-date'

const defaultLowerDate=Date.parse('2001-01-01 00:00:00Z')/1000

export interface NoteSearchQuery { // fields named like in the API
	mode: 'search'
	display_name?: string // username
	user?: number // user id
	q?: string
	from?: number
	to?: number
	closed: number // defaults to -1 because that's how user's note page would have worked
	sort: 'created_at'|'updated_at' // defaults to created_at for now because it's a more stable ordering
	order: 'newest'|'oldest'
}

export interface NoteBboxQuery {
	mode: 'bbox'
	bbox: string
	closed: number // defaults to -1 because that's how user's note page would have worked
}

export interface NoteIdsQuery {
	mode: 'ids'
	ids: number[]
}

export type NoteQuery = NoteSearchQuery | NoteBboxQuery | NoteIdsQuery

function makeUserQueryFromDisplayNameAndUser(display_name: string|undefined|null, user: number|undefined|null): UserQuery {
	if (display_name!=null) {
		return {
			userType: 'name',
			username: display_name
		}
	} else if (user!=null && Number.isInteger(user)) {
		return {
			userType: 'id',
			uid: user
		}
	} else {
		return {
			userType: 'empty'
		}
	}
}

export function makeUserQueryFromNoteSearchQuery(query: NoteSearchQuery): UserQuery {
	return makeUserQueryFromDisplayNameAndUser(query.display_name,query.user)
}

function makeNoteSearchQueryFromUserQueryAndValues(
	userQuery: UserQuery, textValue: string, fromValue: string, toValue: string, closedValue: string, sortValue: string, orderValue: string
): NoteSearchQuery | undefined {
	const noteSearchQuery: NoteSearchQuery = {
		mode: 'search',
		closed: toClosed(closedValue),
		sort: toSort(sortValue),
		order: toOrder(orderValue)
	}
	{
		if (userQuery.userType=='invalid') return undefined
		if (userQuery.userType=='name') {
			noteSearchQuery.display_name=userQuery.username
		} else if (userQuery.userType=='id') {
			noteSearchQuery.user=userQuery.uid
		}
	}{
		const s=textValue.trim()
		if (s) noteSearchQuery.q=s
	}{
		const dateTimeQuery=toDateQuery(fromValue)
		if (dateTimeQuery.dateType=='invalid') return undefined
		if (dateTimeQuery.dateType=='valid') noteSearchQuery.from=dateTimeQuery.date
	}{
		const dateTimeQuery=toDateQuery(toValue)
		if (dateTimeQuery.dateType=='invalid') return undefined
		if (dateTimeQuery.dateType=='valid') noteSearchQuery.to=dateTimeQuery.date
	}
	return noteSearchQuery
	function toClosed(value: string): NoteSearchQuery['closed'] {
		const n=Number(value||undefined)
		if (Number.isInteger(n)) return n
		return -1
	}
	function toSort(value: string): NoteSearchQuery['sort'] {
		if (value=='updated_at') return value
		return 'created_at'
	}
	function toOrder(value: string): NoteSearchQuery['order'] {
		if (value=='oldest') return value
		return 'newest'
	}
}

export function makeNoteSearchQueryFromValues(
	userValue: string, textValue: string, fromValue: string, toValue: string, closedValue: string, sortValue: string, orderValue: string
): NoteSearchQuery | undefined {
	return makeNoteSearchQueryFromUserQueryAndValues(
		toUserQuery(userValue),
		textValue,fromValue,toValue,closedValue,sortValue,orderValue
	)
}

export function makeNoteBboxQueryFromValues(
	bboxValue: string, closedValue: string
): NoteBboxQuery | undefined {
	const noteBboxQuery: NoteBboxQuery = {
		mode: 'bbox',
		bbox: bboxValue.trim(), // TODO validate
		closed: toClosed(closedValue),
	}
	return noteBboxQuery
	function toClosed(value: string): NoteSearchQuery['closed'] {
		const n=Number(value||undefined)
		if (Number.isInteger(n)) return n
		return -1
	}
}

export function makeNoteQueryFromHash(queryString: string): NoteQuery | undefined {
	const paramString = (queryString[0]=='#')
		? queryString.slice(1)
		: queryString
	const searchParams=new URLSearchParams(paramString)
	const mode=searchParams.get('mode')
	if (mode=='search') {
		const userQuery=makeUserQueryFromDisplayNameAndUser(searchParams.get('display_name'),Number(searchParams.get('user')||undefined))
		return makeNoteSearchQueryFromUserQueryAndValues(
			userQuery,
			searchParams.get('q')||'',searchParams.get('from')||'',searchParams.get('to')||'',
			searchParams.get('closed')||'',searchParams.get('sort')||'',searchParams.get('order')||''
		)
	} else if (mode=='bbox') {
		return makeNoteBboxQueryFromValues(
			searchParams.get('bbox')||'',searchParams.get('closed')||''
		)
	} else {
		return undefined
	}
}

/**
 * @returns query string that can be stored in url/db or empty string if the query is not supposed to be stored
 */
export function makeNoteQueryString(query: NoteQuery, withMode: boolean = true): string {
	const parameters:Array<[string,string|number]>=[]
	if (withMode) parameters.push(['mode',query.mode])
	if (query.mode=='search') {
		if (query.display_name!=null) {
			parameters.push(['display_name',query.display_name])
		} else if (query.user!=null) {
			parameters.push(['user',query.user])
		}
		if (query.q!=null) {
			parameters.push(['q',query.q])
		}
		parameters.push(
			['sort',query.sort],
			['order',query.order],
			['closed',query.closed]
		)
		if (query.from!=null) parameters.push(['from',toUrlDate(query.from)])
		if (query.to  !=null) parameters.push(['to'  ,toUrlDate(query.to)])
	} else if (query.mode=='bbox') {
		parameters.push(
			['bbox',query.bbox],
			['closed',query.closed]
		)
	} else {
		return ''
	}
	return parameters.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&')
}

export interface NoteFetchDetails {
	parameters: string
	limit: number // to be (checked against result size for exit condition) and (passed as lastLimit on the next iteration)
}

/**
 * Get (next) date-windowed query, which is only relevant for note search queries for now
 * @returns fd.parameters - url parameters in this order: 
                            user OR display_name;
                            q;
                            sort, order - these don't change within a query;
                            closed - this may change between phases;
                            from, to - this change for pagination purposes, from needs to be present with a dummy date if to is used
                            limit - this may change in rare circumstances, not part of query proper;
 */
export function getNextFetchDetails(query: NoteSearchQuery, requestedLimit: number, lastNote?: Note, prevLastNote?: Note, lastLimit?: number): NoteFetchDetails {
	let lowerDate: number | undefined
	let upperDate: number | undefined
	let lastDate: number | undefined
	let limit=requestedLimit
	if (lastNote) {
		if (lastNote.comments.length<=0) throw new Error(`note #${lastNote.id} has no comments`)
		lastDate=getTargetComment(lastNote).date
		if (prevLastNote) {
			if (prevLastNote.comments.length<=0) throw new Error(`note #${prevLastNote.id} has no comments`)
			if (lastLimit==null) throw new Error(`no last limit provided along with previous last note #${prevLastNote.id}`)
			const prevLastDate=getTargetComment(prevLastNote).date
			if (lastDate==prevLastDate) {
				limit=lastLimit+requestedLimit
			}
		}
	}
	if (lastDate!=null) {
		if (query.order=='oldest') {
			lowerDate=lastDate
		} else {
			upperDate=lastDate+1
		}
	}
	if (query.to!=null) {
		if (upperDate==null) {
			upperDate=query.to
		} else {
			if (upperDate>query.to) {
				upperDate=query.to
			}
		}
	}
	if (query.from!=null) {
		if (lowerDate==null) {
			lowerDate=query.from
		}
	}
	if (lowerDate==null && upperDate!=null) {
		lowerDate=defaultLowerDate
	}
	const updatedQuery={...query}
	if (lowerDate!=null) updatedQuery.from=lowerDate
	if (upperDate!=null) updatedQuery.to=upperDate
	return {
		parameters: makeNoteQueryString(updatedQuery,false)+'&limit='+encodeURIComponent(limit),
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
