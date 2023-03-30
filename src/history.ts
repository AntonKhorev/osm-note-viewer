import type Net from './net'
import type {HashServerSelector} from './net'
import {getHashFromLocation, detachValueFromHash, attachValueToFrontOfHash, attachValueToBackOfHash} from './util/hash'
import {bubbleCustomEvent} from './util/events'

const scrollRestorerEnabled=true // almost works without this, just won't restore position correctly on forward

export default class GlobalHistory {
	$resizeObservationTarget: HTMLElement|undefined // needs to be set before calling restoreScrollPosition()
	private rememberScrollPosition=false
	constructor(
		private readonly $root: HTMLElement,
		private readonly $scrollingPart: HTMLElement,
		net: Net<HashServerSelector>
	) {
		if (!scrollRestorerEnabled) return
		history.scrollRestoration='manual'
		const replaceScrollPositionInHistory=()=>{
			const scrollPosition=$scrollingPart.scrollTop
			history.replaceState({scrollPosition},'')
		}
		let rememberScrollPositionTimeoutId: number
		$scrollingPart.addEventListener('scroll',()=>{
			if (!this.rememberScrollPosition) return
			clearTimeout(rememberScrollPositionTimeoutId)
			rememberScrollPositionTimeoutId=setTimeout(replaceScrollPositionInHistory,50)
			// TODO save more panel open/closed state... actually all panels open/closed states - Firefox does that, Chrome doesn't
			// ... or save some other kind of position relative to notes table instead of scroll
		})
		net.serverSelector.installHashChangeListener(net.cx,hostlessHash=>{
			const [mapHashValue,queryHash]=detachValueFromHash('map',hostlessHash)
			if (mapHashValue) {
				this.onMapHashChange(mapHashValue)
			}
			// TODO don't run stuff below if only map hash changed? or don't zoom to notes if map hash present?
			bubbleCustomEvent($root,'osmNoteViewer:queryHashChange',queryHash)
			this.restoreScrollPosition()
		})
		$root.addEventListener('osmNoteViewer:mapMoveEnd',({detail:{zoom,lat,lon}})=>{
			const mapHashValue=`${zoom}/${lat}/${lon}`
			const hash=getHashFromLocation()
			const [hostHashValue,hostlessHash]=detachValueFromHash('host',hash)
			const [,queryHash]=detachValueFromHash('map',hostlessHash)
			const updatedHostlessHash=attachValueToBackOfHash('map',mapHashValue,queryHash)
			const updatedHash=attachValueToFrontOfHash('host',hostHashValue,updatedHostlessHash)
			history.replaceState(history.state,'','#'+updatedHash)
		})
		$root.addEventListener('osmNoteViewer:newNoteStream',({detail:[queryHash,isNewStart]})=>{
			if (!net.cx) return
			let mapHashValue=''
			if (!isNewStart) {
				const hash=getHashFromLocation()
				const [currentMapHashValue]=detachValueFromHash('map',hash)
				mapHashValue=currentMapHashValue??''
			}
			const hostHashValue=net.serverSelector.getHostHashValueForServer(net.cx.server)
			const updatedHostlessHash=attachValueToBackOfHash('map',mapHashValue,queryHash)
			const updatedHash=attachValueToFrontOfHash('host',hostHashValue,updatedHostlessHash)
			const fullHash=updatedHash ? '#'+updatedHash : ''
			if (fullHash!=location.hash) {
				const url=fullHash||location.pathname+location.search
				if (isNewStart) {
					history.pushState(history.state,'',url)
				} else {
					history.replaceState(history.state,'',url)
				}
			}
		})
	}
	triggerInitialMapHashChange(): void {
		const hash=getHashFromLocation()
		const [mapHashValue]=detachValueFromHash('map',hash)
		if (mapHashValue) {
			this.onMapHashChange(mapHashValue)
		}
	}
	restoreScrollPosition(): void {
		if (!scrollRestorerEnabled || !this.$resizeObservationTarget) return
		// requestAnimationFrame and setTimeout(...,0) don't work very well: https://stackoverflow.com/a/38029067
		// ResizeObserver works better: https://stackoverflow.com/a/66172042
		this.rememberScrollPosition=false
		let nRestoreScrollPositionAttempts=0
		const tryToRestoreScrollPosition: ()=>boolean = ()=>{
			if (++nRestoreScrollPositionAttempts>10) return true
			if (!history.state) return true
			const needToScrollTo=history.state.scrollPosition
			if (typeof needToScrollTo != 'number') return true
			const canScrollTo=this.$scrollingPart.scrollHeight-this.$scrollingPart.clientHeight
			if (needToScrollTo>canScrollTo) return false
			this.$scrollingPart.scrollTop=needToScrollTo
			return true
		}
		if (tryToRestoreScrollPosition()) {
			this.rememberScrollPosition=true
			return
		}
		const resizeObserver=new ResizeObserver(()=>{
			if (tryToRestoreScrollPosition()) {
				resizeObserver.disconnect()
				this.rememberScrollPosition=true
			}
		})
		resizeObserver.observe(this.$resizeObservationTarget) // observing $scrollingPart won't work because its size doesn't change
	}
	getQueryHash(): string {
		const hash=getHashFromLocation()
		const [,hostlessHash]=detachValueFromHash('host',hash)
		const [,queryHash]=detachValueFromHash('map',hostlessHash)
		return queryHash
	}
	hasMapHash(): boolean {
		const hash=getHashFromLocation()
		const [mapHashValue]=detachValueFromHash('map',hash)
		return !!mapHashValue
	}
	private onMapHashChange(mapHashValue: string) {
		const [zoom,lat,lon]=mapHashValue.split('/')
		if (zoom && lat && lon) {
			bubbleCustomEvent(this.$root,'osmNoteViewer:mapMoveTrigger',{zoom,lat,lon})
		}
	}
}
