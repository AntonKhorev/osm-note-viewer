import type NoteViewerStorage from './storage'
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
	move($root: HTMLElement, storage: NoteViewerStorage, ev: PointerEvent) {
		const pointerPosition=this.pick(ev.clientX,ev.clientY)
		const minSideSize=this.pick(minHorSideSize,minVerSideSize)
		const rootExtraSize=this.pick($root.clientWidth,$root.clientHeight)-2*minSideSize
		const targetSidebarSize=pointerPosition-this.startOffset
		const targetExtraSize=targetSidebarSize-minSideSize
		const sidebarFraction=setSizeProperties($root,this.isHor,targetExtraSize/rootExtraSize)
		const storageKey=this.pick('hor-','ver-')+'sidebar-fraction'
		storage.setItem(storageKey,String(sidebarFraction))
	}
	pick<T>(x: T, y: T): T {
		return this.isHor ? x : y
	}
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
	}
}
