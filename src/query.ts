import {Note, NoteComment} from './data'

export interface NoteQuery {
	user: string
	status: 'mixed'|'open'|'separate'
	sort: 'created_at'|'updated_at'
	order: 'newest'|'oldest'
	limit: number
	beganAt?: number
	endedAt?: number
}

export function toNoteQueryStatus(value: string): NoteQuery['status'] {
	if (value=='open' || value=='separate') return value
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
	autorun: boolean
}

/**
 * @returns fd.parameters - url parameters in this order: 
                            display_name, sort, order - these don't change within a query;
                            closed - this may change between phases;
                            limit - this may change within a phase in rare circumstances;
                            from, to - this change for pagination purposes, from needs to be present with a dummy date if to is used
 */
export function getNextFetchDetails(query: NoteQuery, lastNote?: Note, prevLastNote?: Note, lastLimit?: number): NoteFetchDetails {
	let closed=-1
	if (query.status=='open') closed=0
	let lowerDateLimit:string|undefined
	let upperDateLimit:string|undefined
	if (lastNote) {
		if (lastNote.comments.length<=0) throw new Error(`note #${lastNote.id} has no comments`)
		if (query.order=='oldest') {
			lowerDateLimit=makeLowerLimit(getTargetComment(lastNote).date)
		} else {
			upperDateLimit=makeUpperLimit(getTargetComment(lastNote).date)
		}
	}
	if (lowerDateLimit==null && upperDateLimit!=null) {
		lowerDateLimit='2001-01-01T00:00:00Z'
	}
	const parameters:Array<[string,string|number]>=[
		['display_name',query.user],
		['sort',query.sort],
		['order',query.order],
		['closed',closed],
		['limit',query.limit]
	]
	if (lowerDateLimit!=null) parameters.push(['from',lowerDateLimit])
	if (upperDateLimit!=null) parameters.push(['to',upperDateLimit])
	return {
		parameters: parameters.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&'),
		limit: query.limit,
		autorun: true
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
