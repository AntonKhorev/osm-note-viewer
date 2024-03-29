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
		this.side=forceValidSide($root,$side.dataset.side)
		const frontSize=getFrontSize($root,$side,this.side)
		const pointerPosition=getPointerPosition(ev,isHor(this.side))
		this.startOffset=pointerPosition-frontSize
		const targetFrontFraction=getTargetFraction($root,isHor(this.side),frontSize)
		this.startFrontFraction=this.frontFraction=clampFrontFraction(targetFrontFraction)
	}
	move($root: HTMLElement, ev: PointerEvent): void {
		const pointerPosition=getPointerPosition(ev,isHor(this.side))
		const targetFrontSize=pointerPosition-this.startOffset
		const targetFrontFraction=getTargetFraction($root,isHor(this.side),targetFrontSize)
		this.frontFraction=clampFrontFraction(targetFrontFraction)
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
	private readonly $uiOverlayGhostButton: HTMLElement
	private $flipMargins={
		top: makeFlipMargin('top'),
		bottom: makeFlipMargin('bottom'),
		left: makeFlipMargin('left'),
		right: makeFlipMargin('right'),
	}
	private readonly $uiOverlaySide: HTMLElement
	private readonly $uiOverlay: HTMLElement
	constructor(
		private readonly $root: HTMLElement,
		private readonly $side: HTMLElement,
		private readonly storage: NoteViewerStorage
	) {
		this.$uiOverlayGhostButton=makeElement('span')('global','resize')()
		this.$uiOverlaySide=makeDiv('text-side')()
		this.$uiOverlay=makeDiv('ui','overlay')(
			this.$uiOverlaySide,
			makeDiv('graphic-side')(
				this.$uiOverlayGhostButton
			)
		)
		this.$uiOverlay.hidden=true
		$root.after(this.$uiOverlay)
		this.$uiOverlay.append(...Object.values(this.$flipMargins))
		setDefaultProperties($root,$side,storage)
		setDefaultProperties(this.$uiOverlay,this.$uiOverlaySide,storage)
		this.$button=makeElement('button')('global','resize')()
		this.$button.title=`Resize sidebar`
	}
	startListening(map: NoteMap) {
		let move:Move|undefined
		let deferredPropertiesUpdate: (()=>void) | undefined
		this.$button.onpointerdown=ev=>{
			move=new Move(this.$root,this.$side,ev)
			const side=move.side
			const frontFraction=move.frontFraction
			deferredPropertiesUpdate=()=>{
				this.$side.dataset.side=side
				setFrontSizeProperties(this.$root,side,frontFraction)
			}
			{
				this.$uiOverlaySide.dataset.side=side
				setFrontSizeProperties(this.$uiOverlay,side,frontFraction)
			}
			this.showOverlay(move.side)
			this.$button.setPointerCapture(ev.pointerId)
			this.$button.style.opacity='0'
		}
		this.$button.onpointerup=this.$button.onpointercancel=ev=>{
			if (deferredPropertiesUpdate) {
				deferredPropertiesUpdate()
				deferredPropertiesUpdate=undefined
				map.invalidateSize()
			}
			this.$button.style.removeProperty('opacity')
			this.hideOverlay()
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
				const startSidebarFraction=move.startSidebarFraction
				deferredPropertiesUpdate=()=>{
					this.$side.dataset.side=side
					setSidebarSizeProperties(this.$root,side,startSidebarFraction)
				}
				{
					this.$uiOverlaySide.dataset.side=side
					setSidebarSizeProperties(this.$uiOverlay,side,startSidebarFraction)
				}
				return true
			}
			if (onLeftMargin && flipAction(move,'left')) {
			} else if (onRightMargin && flipAction(move,'right')) {
			} else if (onTopMargin && flipAction(move,'top')) {
			} else if (onBottomMargin && flipAction(move,'bottom')) {
			} else {
				move.move(this.$root,ev)
				const side=move.side
				const frontFraction=move.frontFraction
				deferredPropertiesUpdate=()=>{
					this.$side.dataset.side=side
					setFrontSizeProperties(this.$root,side,frontFraction)
				}
				{
					this.$uiOverlaySide.dataset.side=side
					setFrontSizeProperties(this.$uiOverlay,side,frontFraction)
				}
			}
		}
		this.$button.onkeydown=ev=>{
			if (move) return
			const stepBase=ev.shiftKey?24:8
			let step:number|undefined
			const side=forceValidSide(this.$root,this.$side.dataset.side)
			this.$side.dataset.side=side
			this.$uiOverlaySide.dataset.side=side
			const flip=(newSide:Side)=>{
				const frontSize=getFrontSize(this.$root,this.$side,side)
				const targetFrontFraction=getTargetFraction(this.$root,isHor(side),frontSize)
				const targetSidebarFraction=adjustFraction(side,targetFrontFraction)
				this.storage.setItem('sidebar-side',this.$side.dataset.side=newSide)
				const sidebarFraction=setSidebarSizeProperties(this.$root,newSide,targetSidebarFraction)
				setSidebarSizeProperties(this.$uiOverlay,newSide,targetSidebarFraction)
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
				const frontFraction=clampFrontFraction(targetFrontFraction)
				setFrontSizeProperties(this.$root,side,frontFraction)
				setFrontSizeProperties(this.$uiOverlay,side,frontFraction)
				this.storeFrontSize(side,frontFraction)
			}
			map.invalidateSize()
			if (step==null) return
			ev.stopPropagation()
			ev.preventDefault()
		}
	}
	showOverlay(againstSide: 'top'|'bottom'|'left'|'right'): void {
		this.$uiOverlay.hidden=false
		for (const [side,$flipMargin] of Object.entries(this.$flipMargins)) {
			$flipMargin.hidden=side==againstSide
		}
	}
	hideOverlay(): void {
		for (const $flipMargin of Object.values(this.$flipMargins)) {
			$flipMargin.hidden=true
			$flipMargin.classList.remove('active')
		}
		this.$uiOverlay.hidden=true
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

function clampFrontFraction(frontFraction: number): number {
	if (frontFraction<0) frontFraction=0
	if (frontFraction>1) frontFraction=1
	if (Number.isNaN(frontFraction)) frontFraction=0.5
	return frontFraction
}

function setDefaultProperties($ui: HTMLElement, $side: HTMLElement, storage: NoteViewerStorage): void {
	$ui.style.setProperty('--min-hor-side-size',`${minHorSideSize}px`)
	$ui.style.setProperty('--min-ver-side-size',`${minVerSideSize}px`)
	const side=$side.dataset.side=forceValidSide($ui,storage.getItem('sidebar-side'))
	const sidebarFractionItem=storage.getItem(`sidebar-fraction`)
	if (sidebarFractionItem!=null) {
		setSidebarSizeProperties($ui,side,Number(sidebarFractionItem))
	}
}

function setSidebarSizeProperties($root: HTMLElement, side: Side, sidebarFraction: number): number { // TODO return void
	const frontFraction=adjustFraction(side,sidebarFraction)
	const outputFrontFraction=clampFrontFraction(frontFraction)
	setFrontSizeProperties($root,side,outputFrontFraction)
	return adjustFraction(side,outputFrontFraction)
}

function setFrontSizeProperties($root: HTMLElement, side: Side, frontFraction: number): void {
	const fr=Math.round(frontFraction*frMultiplier)
	$root.style.setProperty(isHor(side) ? '--left-side-size' : '--top-side-size',`${fr}fr`)
	$root.style.setProperty(isHor(side) ? '--right-side-size' : '--bottom-side-size',`${frMultiplier-fr}fr`)
}
