import {Note, NoteComment} from './data'
import {UserQuery, toUserQuery} from './query-user'
import {toDateQuery, toUrlDate} from './query-date'

const defaultLowerDate=Date.parse('2001-01-01 00:00:00Z')/1000

export interface NoteQuery { // fields named like in the API
	display_name?: string // username
	user?: number // user id
	q?: string
	from?: number
	to?: number
	closed: number
	sort: 'created_at'|'updated_at'
	order: 'newest'|'oldest'
	// beganAt?: number // TODO move to db record
	// endedAt?: number
}

export function noteQueryToUserQuery(noteQuery: NoteQuery): UserQuery {
	if (noteQuery.display_name!=null) {
		return {
			userType: 'name',
			username: noteQuery.display_name
		}
	} else if (noteQuery.user!=null) {
		return {
			userType: 'id',
			uid: noteQuery.user
		}
	} else {
		return {
			userType: 'empty'
		}
	}
}

export function makeNoteQueryFromInputValues(
	userValue: string, textValue: string, fromValue: string, toValue: string, closedValue: string, sortValue: string, orderValue: string
): NoteQuery | undefined {
	const noteQuery: NoteQuery = {
		closed: toNoteQueryClosed(closedValue),
		sort: toNoteQuerySort(sortValue),
		order: toNoteQueryOrder(orderValue)
	}
	{
		const userQuery=toUserQuery(userValue)
		if (userQuery.userType=='invalid') return undefined
		if (userQuery.userType=='name') {
			noteQuery.display_name=userQuery.username
		} else if (userQuery.userType=='id') {
			noteQuery.user=userQuery.uid
		}
	}{
		const s=textValue.trim()
		if (s) noteQuery.q=s
	}{
		const dateTimeQuery=toDateQuery(fromValue)
		if (dateTimeQuery.dateType=='invalid') return undefined
		if (dateTimeQuery.dateType=='valid') noteQuery.from=dateTimeQuery.date
	}{
		const dateTimeQuery=toDateQuery(toValue)
		if (dateTimeQuery.dateType=='invalid') return undefined
		if (dateTimeQuery.dateType=='valid') noteQuery.to=dateTimeQuery.date
	}
	return noteQuery
	function toNoteQueryClosed(value: string): NoteQuery['closed'] {
		const n=Number(value)
		if (Number.isInteger(n)) return n
		return 7
	}
	function toNoteQuerySort(value: string): NoteQuery['sort'] {
		if (value=='updated_at') return value
		return 'created_at'
	}
	function toNoteQueryOrder(value: string): NoteQuery['order'] {
		if (value=='oldest') return value
		return 'newest'
	}
}

export interface NoteFetchDetails {
	parameters: string
	limit: number // to be (checked against result size for exit condition) and (passed as lastLimit on the next iteration)
}

/**
 * @returns fd.parameters - url parameters in this order: 
                            user OR display_name;
                            q;
                            sort, order - these don't change within a query;
                            closed - this may change between phases;
                            limit - this may change within a phase in rare circumstances;
                            from, to - this change for pagination purposes, from needs to be present with a dummy date if to is used
 */
export function getNextFetchDetails(query: NoteQuery, requestedLimit: number, lastNote?: Note, prevLastNote?: Note, lastLimit?: number): NoteFetchDetails {
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
	const parameters:Array<[string,string|number]>=[]
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
		['closed',query.closed],
		['limit',limit]
	)
	if (lowerDate!=null) parameters.push(['from',toUrlDate(lowerDate)])
	if (upperDate!=null) parameters.push(['to',toUrlDate(upperDate)])
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
