import type NoteViewerStorage from './storage'
import type NoteMap from './map'
import {makeDiv, makeElement} from './util/html'
import {setStorageBoolean} from './util/storage'

const minHorSideSize=80
const minVerSideSize=80
const frMultiplier=100000

type Side = 'top'|'bottom'|'left'|'right'

function isHor(side: Side) {
	return side=='left' || side=='right'
}

class Move {
	side: Side
	startOffset: number
	constructor($root: HTMLElement, $side: HTMLElement, ev: PointerEvent) {
		this.side=$side.dataset.side=forceValidSide($root,$side.dataset.side)
		const frontSize=getFrontSize($root,$side,this.side)
		const pointerPosition=getPointerPosition(ev,isHor(this.side))
		this.startOffset=pointerPosition-frontSize
	}
	move($root: HTMLElement, storage: NoteViewerStorage, ev: PointerEvent) {
		const pointerPosition=getPointerPosition(ev,isHor(this.side))
		const targetFrontSize=pointerPosition-this.startOffset
		setAndStoreFrontSize($root,storage,isHor(this.side),targetFrontSize)
	}
}

function makeFlipMargin(side: Side): HTMLElement {
	const $flipMargin=makeDiv('flip-margin')(makeElement('span')('side-indicator')())
	$flipMargin.dataset.side=side
	$flipMargin.hidden=true
	return $flipMargin
}

function forceValidSide($root: HTMLElement, side: string|null|undefined): Side {
	if (side=='top' || side=='bottom' || side=='left' || side=='right') {
		return side
	} else {
		return $root.clientHeight>$root.clientWidth ? 'top' : 'left'
	}
}

export default class SidebarResizer {
	readonly $button: HTMLButtonElement
	private $flipMargins={
		top: makeFlipMargin('top'),
		bottom: makeFlipMargin('bottom'),
		left: makeFlipMargin('left'),
		right: makeFlipMargin('right'),
	}
	constructor(
		private readonly $root: HTMLElement,
		private readonly $side: HTMLElement,
		private readonly storage: NoteViewerStorage
	) {
		$root.append(...Object.values(this.$flipMargins))
		setStartingRootProperties($root,storage)
		$side.dataset.side=forceValidSide($root,storage.getItem('sidebar-side'))
		this.$button=makeElement('button')('global','resize')()
		this.$button.innerHTML=`<svg><use href="#resize" /></svg>`
		this.$button.title=`Resize sidebar`
	}
	startListening(map: NoteMap) {
		let move:Move|undefined
		this.$button.onpointerdown=ev=>{
			move=new Move(this.$root,this.$side,ev)
			this.showFlipMargins(move.side)
			this.$button.setPointerCapture(ev.pointerId)
		}
		this.$button.onpointerup=this.$button.onpointercancel=ev=>{
			this.storage.setItem('sidebar-side',
				forceValidSide(this.$root,this.$side.dataset.side)
			)
			move=undefined
			this.hideFlipMargins()
		}
		this.$button.onpointermove=ev=>{
			if (!move) return
			let onLeftMargin=ev.clientX<minHorSideSize
			let onRightMargin=ev.clientX>=this.$root.clientWidth-minHorSideSize
			let onTopMargin=ev.clientY<minVerSideSize
			let onBottomMargin=ev.clientY>=this.$root.clientHeight-minVerSideSize
			if ((+onLeftMargin)+(+onRightMargin)+(+onTopMargin)+(+onBottomMargin)>1) {
				onLeftMargin=onRightMargin=onTopMargin=onBottomMargin=false
			}
			this.$flipMargins.left.classList.toggle('active',onLeftMargin && move.side!='left')
			this.$flipMargins.right.classList.toggle('active',onRightMargin && move.side!='right')
			this.$flipMargins.top.classList.toggle('active',onTopMargin && move.side!='top')
			this.$flipMargins.bottom.classList.toggle('active',onBottomMargin && move.side!='bottom')
			if (onLeftMargin && move.side!='left') {
				this.$side.dataset.side='left'
			} else if (onRightMargin && move.side!='right') {
				this.$side.dataset.side='right'
			} else if (onTopMargin && move.side!='top') {
				this.$side.dataset.side='top'
			} else if (onBottomMargin && move.side!='bottom') {
				this.$side.dataset.side='bottom'
			} else {
				this.$side.dataset.side=move.side
				move.move(this.$root,this.storage,ev)
			}
			map.invalidateSize()
		}
		this.$button.onkeydown=ev=>{
			const flip=(side:Side)=>{
				this.storage.setItem('sidebar-side',this.$side.dataset.side=side)
			}
			if (move) return
			const stepBase=ev.shiftKey?24:8
			let step:number|undefined
			const side=this.$side.dataset.side=forceValidSide(this.$root,this.$side.dataset.side)
			if (isHor(side) && ev.key=='ArrowUp') {
				flip('top')
			} else if (isHor(side) && ev.key=='ArrowDown') {
				flip('bottom')
			} else if (!isHor(side) && ev.key=='ArrowLeft') {
				flip('left')
			} else if (!isHor(side) && ev.key=='ArrowRight') {
				flip('right')
			} else if (ev.key=='ArrowLeft' || ev.key=='ArrowUp') {
				step=-stepBase
			} else if (ev.key=='ArrowRight' || ev.key=='ArrowDown') {
				step=+stepBase
			} else {
				return
			}
			if (step==null) return
			if (step) {
				const frontSize=getFrontSize(this.$root,this.$side,side)
				const targetFrontSize=frontSize+step
				setAndStoreFrontSize(this.$root,this.storage,isHor(side),targetFrontSize)
			}
			map.invalidateSize()
			ev.stopPropagation()
			ev.preventDefault()
		}
	}
	showFlipMargins(againstSide: 'top'|'bottom'|'left'|'right'): void {
		for (const [side,$flipMargin] of Object.entries(this.$flipMargins)) {
			$flipMargin.hidden=side==againstSide
		}
	}
	hideFlipMargins(): void {
		for (const $flipMargin of Object.values(this.$flipMargins)) {
			$flipMargin.hidden=true
			$flipMargin.classList.remove('active')
		}
	}
}

function setStartingRootProperties($root: HTMLElement, storage: NoteViewerStorage) {
	$root.style.setProperty('--min-hor-side-size',`${minHorSideSize}px`)
	$root.style.setProperty('--min-ver-side-size',`${minVerSideSize}px`)
	const horSidebarFractionItem=storage.getItem('sidebar-fraction[hor]')
	if (horSidebarFractionItem!=null) {
		setSizeProperties($root,true,Number(horSidebarFractionItem))
	}
	const verSidebarFractionItem=storage.getItem('sidebar-fraction[ver]')
	if (verSidebarFractionItem!=null) {
		setSizeProperties($root,false,Number(verSidebarFractionItem))
	}
}

function getPointerPosition(ev: PointerEvent, isHor: boolean): number {
	return isHor ? ev.clientX : ev.clientY
}

function getFrontSize($root: HTMLElement, $side: HTMLElement, side: Side): number {
	if (side=='top') {
		return $side.offsetHeight
	} else if (side=='bottom') {
		return $root.clientHeight-$side.offsetHeight
	} else if (side=='left') {
		return $side.offsetWidth
	} else if (side=='right') {
		return $root.clientWidth-$side.offsetWidth
	} else {
		throw new RangeError(`invalid sidebar side`)
	}
}

function setAndStoreFrontSize($root: HTMLElement, storage: NoteViewerStorage, isHor: boolean, targetFrontSize: number): void {
	const targetSidebarFraction=getTargetFrontFraction($root,isHor,targetFrontSize)
	const sidebarFraction=setSizeProperties($root,isHor,targetSidebarFraction)
	const storageKey=`sidebar-fraction[${isHor?'hor':'ver'}]`
	storage.setItem(storageKey,String(sidebarFraction))
}

function getTargetFrontFraction($root: HTMLElement, isHor: boolean, targetFrontSize: number): number {
	const minSideSize=isHor ? minHorSideSize : minVerSideSize
	const rootExtraSize=(isHor?$root.clientWidth:$root.clientHeight)-2*minSideSize
	const targetExtraSize=targetFrontSize-minSideSize
	return targetExtraSize/rootExtraSize
}

function setSizeProperties($root: HTMLElement, isHor: boolean, sidebarFraction: number): number {
	if (sidebarFraction<0) sidebarFraction=0
	if (sidebarFraction>1) sidebarFraction=1
	if (Number.isNaN(sidebarFraction)) sidebarFraction=0.5
	const fr=Math.round(sidebarFraction*frMultiplier)
	$root.style.setProperty(isHor ? '--left-side-size' : '--top-side-size',`${fr}fr`)
	$root.style.setProperty(isHor ? '--right-side-size' : '--bottom-side-size',`${frMultiplier-fr}fr`)
	return sidebarFraction
}
