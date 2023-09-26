import type {Note} from './data'
import {makeElement} from './util/html'

export function makeSvgElement<K extends keyof SVGElementTagNameMap>(tag: K, attrs: {[name:string]:string}={}): SVGElementTagNameMap[K] {
	const $e=document.createElementNS("http://www.w3.org/2000/svg",tag)
	setSvgAttributes($e,attrs)
	return $e
}
function setSvgAttributes($e: SVGElement, attrs: {[name:string]:string}): void {
	for (const name in attrs) {
		$e.setAttributeNS(null,name,attrs[name])
	}
}

export function makeMapIcon(type: string): HTMLElement {
	const $span=makeElement('span')(`icon-map-${type}`)()
	$span.title=`map ${type}`
	$span.innerHTML=`<svg width="19" height="13"><use href="#tools-map" /></svg>`
	return $span
}

export function makeNotesIcon(type: string): HTMLElement {
	const $span=makeElement('span')(`icon-notes-${type}`)()
	$span.title=`${type} notes`
	$span.innerHTML=`<svg width="9" height="13"><use href="#tools-notes" /></svg>`
	return $span
}

export function makeActionIcon(type: string, text: string): HTMLElement {
	const $span=makeElement('span')(`icon-action-${type}`)()
	$span.title=text
	$span.innerHTML=`<svg width="13" height="13"><use href="#tools-${type}" /></svg>`
	return $span
}

export function makeNoteStatusIcon(status: Note['status'], number = 1): HTMLElement {
	const height=16
	const width=8
	const r=width/2
	const $span=makeElement('span')(`icon-note-status`)()
	$span.title=`${status} note${number!=1?`s`:``}`
	const path=`<path d="${computeMarkerOutlinePath(height,width/2-.5)}" stroke="gray" ${pathAttrs()} />`
	$span.innerHTML=`<svg width="${width}" height="${height}" viewBox="${-r} ${-r} ${width} ${height}">${path}</svg>`
	return $span
	function pathAttrs() {
		if (status=='open') {
			return `fill="red"`
		} else if (status=='closed') {
			return `fill="green"`
		} else {
			return `fill="#444"`
		}
	}
	// copypaste from marker.ts
	function computeMarkerOutlinePath(height: number, r: number): string {
		const rp=height-r
		const y=r**2/rp
		const x=Math.sqrt(r**2-y**2)
		const xf=x.toFixed(2)
		const yf=y.toFixed(2)
		return `M0,${rp} L-${xf},${yf} A${r},${r} 0 1 1 ${xf},${yf} Z`
	}
}
