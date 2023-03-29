import type NoteViewerStorage from './storage'
import type NoteMap from './map'
import {makeElement} from './util/html'

const minHorSideSize=80
const minVerSideSize=80
const frMultiplier=100000

class Move {
	isHor: boolean
	startOffset: number
	constructor($root: HTMLElement, $side: HTMLElement, ev: PointerEvent) {
		this.isHor=$root.classList.contains('flipped')
		const sidebarSize=getSidebarSize($side,this.isHor)
		const pointerPosition=getPointerPosition(ev,this.isHor)
		this.startOffset=pointerPosition-sidebarSize
	}
	move($root: HTMLElement, storage: NoteViewerStorage, ev: PointerEvent) {
		const pointerPosition=getPointerPosition(ev,this.isHor)
		const targetSidebarSize=pointerPosition-this.startOffset
		setAndStoreSidebarSize($root,storage,this.isHor,targetSidebarSize)
	}
}

export default class SidebarResizer {
	readonly $button: HTMLButtonElement
	constructor(
		private readonly $root: HTMLElement,
		private readonly $side: HTMLElement,
		private readonly storage: NoteViewerStorage
	) {
		setStartingRootProperties($root,storage)
		this.$button=makeElement('button')('global','resize')()
		this.$button.innerHTML=`<svg><use href="#resize" /></svg>`
		this.$button.title=`Resize sidebar`
	}
	startListening(map: NoteMap) {
		let move:Move|undefined
		this.$button.onpointerdown=ev=>{
			move=new Move(this.$root,this.$side,ev)
			this.$button.setPointerCapture(ev.pointerId)
		}
		this.$button.onpointerup=ev=>{
			move=undefined
		}
		this.$button.onpointermove=ev=>{
			if (!move) return
			move.move(this.$root,this.storage,ev)
			map.invalidateSize()
		}
		this.$button.onkeydown=ev=>{
			if (move) return
			const stepBase=ev.shiftKey?24:8
			let step:number|undefined
			if (ev.key=='ArrowLeft' || ev.key=='ArrowUp') {
				step=-stepBase
			} else if (ev.key=='ArrowRight' || ev.key=='ArrowDown') {
				step=+stepBase
			} else {
				return
			}
			if (step==null) return
			const isHor=this.$root.classList.contains('flipped')
			const sidebarSize=getSidebarSize(this.$side,isHor)
			const targetSidebarSize=sidebarSize+step
			setAndStoreSidebarSize(this.$root,this.storage,isHor,targetSidebarSize)
			map.invalidateSize()
			ev.stopPropagation()
			ev.preventDefault()
		}
	}
}

function setStartingRootProperties($root: HTMLElement, storage: NoteViewerStorage) {
	$root.style.setProperty('--min-hor-side-size',`${minHorSideSize}px`)
	$root.style.setProperty('--min-ver-side-size',`${minVerSideSize}px`)
	const horSidebarFractionItem=storage.getItem('hor-sidebar-fraction')
	if (horSidebarFractionItem!=null) {
		setSizeProperties($root,true,Number(horSidebarFractionItem))
	}
	const verSidebarFractionItem=storage.getItem('ver-sidebar-fraction')
	if (verSidebarFractionItem!=null) {
		setSizeProperties($root,false,Number(verSidebarFractionItem))
	}
}

function getPointerPosition(ev: PointerEvent, isHor: boolean): number {
	return isHor ? ev.clientX : ev.clientY
}

function getSidebarSize($side: HTMLElement, isHor: boolean): number {
	return isHor ? $side.offsetWidth : $side.offsetHeight
}

function setAndStoreSidebarSize($root: HTMLElement, storage: NoteViewerStorage, isHor: boolean, targetSidebarSize: number): void {
	const targetSidebarFraction=getTargetSidebarFraction($root,isHor,targetSidebarSize)
	const sidebarFraction=setSizeProperties($root,isHor,targetSidebarFraction)
	const storageKey=(isHor?'hor-':'ver-')+'sidebar-fraction'
	storage.setItem(storageKey,String(sidebarFraction))
}

function getTargetSidebarFraction($root: HTMLElement, isHor: boolean, targetSidebarSize: number): number {
	const minSideSize=isHor ? minHorSideSize : minVerSideSize
	const rootExtraSize=(isHor?$root.clientWidth:$root.clientHeight)-2*minSideSize
	const targetExtraSize=targetSidebarSize-minSideSize
	return targetExtraSize/rootExtraSize
}

function setSizeProperties($root: HTMLElement, isHor: boolean, sidebarFraction: number): number {
	const extraSizeProperty=isHor ? '--extra-left-side-size' : '--extra-top-side-size'
	const middleSizeProperty=isHor ? '--middle-hor-size' : '--middle-ver-size'
	if (sidebarFraction<0) sidebarFraction=0
	if (sidebarFraction>1) sidebarFraction=1
	if (Number.isNaN(sidebarFraction)) sidebarFraction=0.5
	const extraFr=Math.round(sidebarFraction*frMultiplier)
	$root.style.setProperty(extraSizeProperty,`${extraFr}fr`)
	$root.style.setProperty(middleSizeProperty,`${frMultiplier-extraFr}fr`)
	return sidebarFraction
}