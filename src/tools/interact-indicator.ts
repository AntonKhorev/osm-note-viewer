import type {Note} from '../data'
import {makeNoteStatusIcon} from './base'
import type {WebProvider} from '../server'

export function getMultipleNoteIndicators(
	web: WebProvider,
	statusAndIds: Iterable<[status:Note['status'],ids:readonly number[]]>,
	maxIndividualNotes: number
): (string|HTMLElement)[] {
	const output: (string|HTMLElement)[] = []
	let first=true
	const writeSingleNote=(id:number,status:Note['status'])=>{
		if (!first) output.push(`, `)
		first=false
		output.push(getNoteIndicator(web,status,id))
	}
	const writeOneOrManyNotes=(ids:readonly number[],status:Note['status'])=>{
		if (ids.length==0) {
			return
		}
		if (ids.length==1) {
			writeSingleNote(ids[0],status)
			return
		}
		if (!first) output.push(`, `)
		first=false
		output.push(`${ids.length} × `,makeNoteStatusIcon(status,ids.length))
	}
	const statusAndIdsCopy=[...statusAndIds]
	const nNotes=statusAndIdsCopy.reduce(
		(n:number,[,ids])=>n+ids.length,0
	)
	if (nNotes==0) {
	} else if (nNotes<=maxIndividualNotes) {
		for (const [status,ids] of statusAndIdsCopy) {
			for (const id of ids) {
				writeSingleNote(id,status)
			}
		}
	} else {
		for (const [status,ids] of statusAndIdsCopy) {
			writeOneOrManyNotes(ids,status)
		}
	}
	return output
}

export function getNoteIndicator(web: WebProvider, status: Note['status'], id: number): HTMLAnchorElement {
	const href=web.getUrl(`note/`+encodeURIComponent(id))
	const $a=document.createElement('a')
	$a.href=href
	$a.classList.add('listened')
	$a.dataset.noteId=String(id)
	$a.append(makeNoteStatusIcon(status),` ${id}`)
	return $a
}

export function getButtonNoteIcon(ids:readonly number[],inputStatus:Note['status'],outputStatus:Note['status']): (string|HTMLElement)[] {
	const outputIcon=[]
	if (outputStatus!=inputStatus) {
		outputIcon.push(` → `,makeNoteStatusIcon(outputStatus,ids.length))
	}
	if (ids.length==0) {
		return [makeNoteStatusIcon(inputStatus,ids.length),...outputIcon]
	} else if (ids.length==1) {
		return [makeNoteStatusIcon(inputStatus),` ${ids[0]}`,...outputIcon]
	} else {
		return [`${ids.length} × `,makeNoteStatusIcon(inputStatus,ids.length),...outputIcon,`...`]
	}
}
