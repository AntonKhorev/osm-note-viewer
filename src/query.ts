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
	autorun: boolean
}

/**
 * @returns fd.parameters - url parameters in this order: 
                            display_name, sort, order - these don't change within a query;
                            closed - this may change between phases;
                            limit - this may change within a phase in rare circumstances;
                            from, to - this change for pagination purposes, only one of them is present
 */
export function getNextFetchDetails(query: NoteQuery, allNotes: Note[], lastBatchNotes: Note[]): NoteFetchDetails {
	let closed=-1
	if (query.status=='open') closed=0
	const parameters:Array<[string,string|number]>=[
		['display_name',query.user],
		['sort',query.sort],
		['order',query.order],
		['closed',closed],
		['limit',query.limit]
	]
	return {
		parameters: parameters.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&'),
		autorun: true
	}
}
