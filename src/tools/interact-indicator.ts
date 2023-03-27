import type {Note} from '../data'
import {makeNoteStatusIcon} from './base'
import type {WebProvider} from '../net/server'

export function getMultipleNoteIndicators(
	web: WebProvider,
	idsAndStatusesIterable: Iterable<[id:number,status:Note['status']]>,
	maxIndividualNotes: number
): (string|HTMLElement)[] {
	const output: (string|HTMLElement)[] = []
	const idsAndStatuses=[...idsAndStatusesIterable]
	if (idsAndStatuses.length==0) {
	} else if (idsAndStatuses.length<=maxIndividualNotes) {
		for (const [i,[id,status]] of idsAndStatuses.entries()) {
			if (i) output.push(`, `)
			output.push(
				getNoteIndicator(web,id,status)
			)
		}
	} else {
		const countsByStatus=new Map<Note['status'],number>()
		for (const [i,[,status]] of idsAndStatuses.entries()) {
			if (i==0 || i==idsAndStatuses.length-1) continue
			countsByStatus.set(status,
				(countsByStatus.get(status)??0)+1
			)
		}
		output.push(
			getNoteIndicator(web,...idsAndStatuses[0]),
			` ...(`
		)
		for (const [i,[status,count]] of [...countsByStatus].entries()) {
			if (i) output.push(`, `)
			output.push(
				...getNoteCountIndicator(count,status)
			)
		}
		output.push(
			`)... `,
			getNoteIndicator(web,...idsAndStatuses[idsAndStatuses.length-1])
		)
	}
	return output
}

export function getNoteIndicator(web: WebProvider, id: number, status: Note['status']): HTMLAnchorElement {
	const href=web.getUrl(`note/`+encodeURIComponent(id))
	const $a=document.createElement('a')
	$a.href=href
	$a.classList.add('listened')
	$a.dataset.noteId=String(id)
	$a.append(makeNoteStatusIcon(status),` ${id}`)
	return $a
}

export function getNoteCountIndicator(count: number, status: Note['status']): (string|HTMLElement)[] {
	return [`${count} × `,makeNoteStatusIcon(status,count)]
}

export function getButtonNoteIcon(ids: readonly number[], inputStatus: Note['status'], outputStatus: Note['status']): (string|HTMLElement)[] {
	const outputIcon=[]
	if (outputStatus!=inputStatus) {
		outputIcon.push(` → `,makeNoteStatusIcon(outputStatus,ids.length))
	}
	if (ids.length==0) {
		return [makeNoteStatusIcon(inputStatus,ids.length),...outputIcon]
	} else if (ids.length==1) {
		return [makeNoteStatusIcon(inputStatus),` ${ids[0]}`,...outputIcon]
	} else {
		return [...getNoteCountIndicator(ids.length,inputStatus),...outputIcon,`...`]
	}
}
