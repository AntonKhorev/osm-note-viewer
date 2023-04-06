import type NoteViewerStorage from './storage'
import type NoteMap from './map'
import {makeDiv, makeElement} from './util/html'

const minHorSideSize=80
const minVerSideSize=80
const frMultiplier=100000

type Side = 'top'|'bottom'|'left'|'right'

function isHor(side: Side): boolean {
	return side=='left' || side=='right'
}
function isFront(side: Side): boolean {
	return side=='top' || side=='left'
}

function adjustFraction(side: Side, fraction: number): number {
	return isFront(side) ? fraction : 1-fraction
}

class Move {
	readonly side: Side
	readonly startOffset: number
	frontFraction: number
	readonly startFrontFraction: number
	constructor($root: HTMLElement, $side: HTMLElement, ev: PointerEvent) {
		this.side=$side.dataset.side=forceValidSide($root,$side.dataset.side)
		const frontSize=getFrontSize($root,$side,this.side)
		const pointerPosition=getPointerPosition(ev,isHor(this.side))
		this.startOffset=pointerPosition-frontSize
		const targetFrontFraction=getTargetFraction($root,isHor(this.side),frontSize)
		this.startFrontFraction=this.frontFraction=setFrontSizeProperties($root,this.side,targetFrontFraction)
	}
	move($root: HTMLElement, ev: PointerEvent): void {
		const pointerPosition=getPointerPosition(ev,isHor(this.side))
		const targetFrontSize=pointerPosition-this.startOffset
		const targetFrontFraction=getTargetFraction($root,isHor(this.side),targetFrontSize)
		this.frontFraction=setFrontSizeProperties($root,this.side,targetFrontFraction)
	}
	get sidebarFraction(): number {
		return adjustFraction(this.side,this.frontFraction)
	}
	get startSidebarFraction(): number {
		return adjustFraction(this.side,this.startFrontFraction)
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
		$root.style.setProperty('--min-hor-side-size',`${minHorSideSize}px`)
		$root.style.setProperty('--min-ver-side-size',`${minVerSideSize}px`)
		const side=$side.dataset.side=forceValidSide($root,storage.getItem('sidebar-side'))
		const sidebarFractionItem=storage.getItem(`sidebar-fraction`)
		if (sidebarFractionItem!=null) {
			setSidebarSizeProperties($root,side,Number(sidebarFractionItem))
		}
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
			this.hideFlipMargins()
			if (!move) return
			const newSide=forceValidSide(this.$root,this.$side.dataset.side)
			if (move.side==newSide) {
				this.storeSidebarSize(move.side,move.sidebarFraction)
			} else {
				this.storage.setItem('sidebar-side',newSide)
				this.storeSidebarSize(newSide,move.startSidebarFraction)
			}
			move=undefined
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
			const flipAction=(move:Move,side:Side):boolean=>{
				if (move.side==side) return false
				this.$side.dataset.side=side
				setSidebarSizeProperties(this.$root,side,move.startSidebarFraction)
				return true
			}
			if (onLeftMargin && flipAction(move,'left')) {
			} else if (onRightMargin && flipAction(move,'right')) {
			} else if (onTopMargin && flipAction(move,'top')) {
			} else if (onBottomMargin && flipAction(move,'bottom')) {
			} else {
				this.$side.dataset.side=move.side
				move.move(this.$root,ev)
			}
			map.invalidateSize()
		}
		this.$button.onkeydown=ev=>{
			if (move) return
			const stepBase=ev.shiftKey?24:8
			let step:number|undefined
			const side=this.$side.dataset.side=forceValidSide(this.$root,this.$side.dataset.side)
			const flip=(newSide:Side)=>{
				const frontSize=getFrontSize(this.$root,this.$side,side)
				const targetFrontFraction=getTargetFraction(this.$root,isHor(side),frontSize)
				const targetSidebarFraction=adjustFraction(side,targetFrontFraction)
				this.storage.setItem('sidebar-side',this.$side.dataset.side=newSide)
				const sidebarFraction=setSidebarSizeProperties(this.$root,newSide,targetSidebarFraction)
				this.storeSidebarSize(newSide,sidebarFraction)
			}
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
			if (step) {
				const frontSize=getFrontSize(this.$root,this.$side,side)
				const targetFrontSize=frontSize+step
				const targetFrontFraction=getTargetFraction(this.$root,isHor(side),targetFrontSize)
				const frontFraction=setFrontSizeProperties(this.$root,side,targetFrontFraction)
				this.storeFrontSize(side,frontFraction)
			}
			map.invalidateSize()
			if (step==null) return
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
	private storeSidebarSize(side: Side, sidebarFraction: number): void {
		this.storage.setItem(`sidebar-fraction`,String(sidebarFraction))
	}
	private storeFrontSize(side: Side, sidebarFraction: number): void {
		this.storage.setItem(`sidebar-fraction`,String(adjustFraction(side,sidebarFraction)))
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

function getTargetFraction($root: HTMLElement, isHor: boolean, targetSize: number): number {
	const minSideSize=isHor ? minHorSideSize : minVerSideSize
	const rootExtraSize=(isHor?$root.clientWidth:$root.clientHeight)-2*minSideSize
	const targetExtraSize=targetSize-minSideSize
	return targetExtraSize/rootExtraSize
}

function setSidebarSizeProperties($root: HTMLElement, side: Side, sidebarFraction: number): number {
	const frontFraction=adjustFraction(side,sidebarFraction)
	const outputFrontFraction=setFrontSizeProperties($root,side,frontFraction)
	return adjustFraction(side,outputFrontFraction)
}

function setFrontSizeProperties($root: HTMLElement, side: Side, frontFraction: number): number {
	if (frontFraction<0) frontFraction=0
	if (frontFraction>1) frontFraction=1
	if (Number.isNaN(frontFraction)) frontFraction=0.5
	const fr=Math.round(frontFraction*frMultiplier)
	$root.style.setProperty(isHor(side) ? '--left-side-size' : '--top-side-size',`${fr}fr`)
	$root.style.setProperty(isHor(side) ? '--right-side-size' : '--bottom-side-size',`${frMultiplier-fr}fr`)
	return frontFraction
}
