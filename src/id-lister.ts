import type {WebProvider} from './server'
import {makeEscapeTag, escapeXml} from './escape'

type Item = [text: string, id?: number]

export function listDecoratedNoteIds(inputIds: Iterable<number>): Item[] {
	const ids=[...inputIds].sort((a,b)=>a-b)
	if (ids.length==0) return []
	const ref=(id:number)=>[String(id),id] as Item
	if (ids.length==1) {
		const [id]=ids
		return [['note '],ref(id)]
	}
	const result=[['notes ']] as Item[]
	let first=true
	let rangeStart: number|undefined
	let rangeEnd: number|undefined
	const appendRange=()=>{
		if (rangeStart==null || rangeEnd==null) return
		if (first) {
			first=false
		} else {
			result.push([','])
		}
		if (rangeEnd==rangeStart) {
			result.push(ref(rangeStart))
		} else if (rangeEnd==rangeStart+1) {
			result.push(ref(rangeStart),[','],ref(rangeEnd))
		} else {
			result.push(ref(rangeStart),['-'],ref(rangeEnd))
		}
	}
	for (const id of ids) {
		if (rangeEnd!=null && id==rangeEnd+1) {
			rangeEnd=id
		} else {
			appendRange()
			rangeStart=rangeEnd=id
		}
	}
	appendRange()
	return result
}

export function convertDecoratedNoteIdsToPlainText(decoratedIds: [text:string,id?:number][]): string {
	return decoratedIds.map(([text])=>text).join('')
}

const escU=makeEscapeTag(encodeURIComponent)
const escX=makeEscapeTag(escapeXml)

export function convertDecoratedNoteIdsToHtmlText(decoratedIds: [text:string,id?:number][], web: WebProvider): string {
	return decoratedIds.map(([text,id])=>{
		if (id==null) {
			return text
		} else {
			const href=web.getUrl(escU`note/${id}`)
			return escX`<a href="${href}">${text}</a>`
		}
	}).join('')
}
