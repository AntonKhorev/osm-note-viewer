import {makeElement} from './html'

const minHorSideSize=80
const minVerSideSize=80

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
		const rootSize=this.pick($root.clientWidth,$root.clientHeight)
		let targetSidebarSize=pointerPosition-this.startOffset
		if (targetSidebarSize<minSideSize) {
			targetSidebarSize=minSideSize
		}
		if (targetSidebarSize>rootSize-minSideSize) {
			targetSidebarSize=rootSize-minSideSize
		}
		const targetExtraSize=targetSidebarSize-minSideSize
		const property=this.pick('--extra-left-size-size','--extra-top-size-size')
		$root.style.setProperty(property,`${targetExtraSize}px`)
	}
	pick<T>(x: T, y: T): T {
		return this.isHor ? x : y
	}
}

export default function makeSidebarResizer($root: HTMLElement, $side: HTMLElement): HTMLButtonElement {
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
		// TODO invalidate map size
		move=undefined
	}
	$button.onpointermove=ev=>{
		if (!move) return
		move.move($root,ev)
	}
	return $button
}
