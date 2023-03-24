import type NoteMap from './map'
import {makeElement} from './html'

const minHorSideSize=80
const minVerSideSize=80
const frMultiplier=100000

class Move {
	isHor: boolean
	startOffset: number
	constructor($root: HTMLElement, $side: HTMLElement, ev: PointerEvent) {
		this.isHor=$root.classList.contains('flipped')
		const sidebarSize=this.pick($side.clientWidth,$side.clientHeight)
		const pointerPosition=this.pick(ev.clientX,ev.clientY)
		this.startOffset=pointerPosition-sidebarSize
	}
	move($root: HTMLElement, ev: PointerEvent) {
		const pointerPosition=this.pick(ev.clientX,ev.clientY)
		const minSideSize=this.pick(minHorSideSize,minVerSideSize)
		const rootExtraSize=this.pick($root.clientWidth,$root.clientHeight)-2*minSideSize
		const targetSidebarSize=pointerPosition-this.startOffset
		let targetExtraSize=targetSidebarSize-minSideSize
		if (targetExtraSize<0) targetExtraSize=0
		if (targetExtraSize>rootExtraSize) targetExtraSize=rootExtraSize
		const extraSizeProperty=this.pick('--extra-left-side-size','--extra-top-side-size')
		const middleSizeProperty=this.pick('--middle-hor-size','--middle-ver-size')
		const extraFr=Math.round(targetExtraSize/rootExtraSize*frMultiplier)
		$root.style.setProperty(extraSizeProperty,`${extraFr}fr`)
		$root.style.setProperty(middleSizeProperty,`${frMultiplier-extraFr}fr`)
	}
	pick<T>(x: T, y: T): T {
		return this.isHor ? x : y
	}
}

export default function makeSidebarResizer($root: HTMLElement, $side: HTMLElement, map: NoteMap): HTMLButtonElement {
	$root.style.setProperty('--min-hor-side-size',`${minHorSideSize}px`)
	$root.style.setProperty('--min-ver-side-size',`${minVerSideSize}px`)
	const $button=makeElement('button')('global','resize')()
	$button.innerHTML=`<svg><use href="#resize" /></svg>`
	$button.title=`Resize sidebar`
	let move:Move|undefined
	$button.onpointerdown=ev=>{
		move=new Move($root,$side,ev)
		$button.setPointerCapture(ev.pointerId)
	}
	$button.onpointerup=ev=>{
		// TODO store size
		move=undefined
	}
	$button.onpointermove=ev=>{
		if (!move) return
		move.move($root,ev)
		map.invalidateSize()
	}
	return $button
}
