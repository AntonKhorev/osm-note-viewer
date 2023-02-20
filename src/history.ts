import type ServerList from './server-list'
import type Server from './server'
import {getHashSearchParams} from './hash'
import {escapeHash} from './escape'
import {bubbleCustomEvent} from './html'

const scrollRestorerEnabled=true // almost works without this, just won't restore position correctly on forward

export interface GlobalHistoryWithServer {
	onQueryHashChange?: (queryHash: string) => void
	$resizeObservationTarget: HTMLElement|undefined
	readonly server: Server
	readonly serverList: ServerList
	triggerInitialMapHashChange(): void
	restoreScrollPosition(): void
	getQueryHash(): string
	setQueryHash(queryHash: string, pushStateAndRemoveMapHash: boolean): void
	setMapHash(mapHash: string): void
	hasMapHash(): boolean
}

export default class GlobalHistory {
	onQueryHashChange?: (queryHash: string) => void
	$resizeObservationTarget: HTMLElement|undefined // needs to be set before calling restoreScrollPosition()
	private rememberScrollPosition=false
	public readonly server: Server|undefined
	public readonly serverHash: string = ''
	private readonly hostHashValue: string|null
	constructor(
		private readonly $root: HTMLElement,
		private readonly $scrollingPart: HTMLElement,
		public readonly serverList: ServerList
	) {
		{
			const [,,hostHashValue]=this.getAllHashes()
			this.hostHashValue=hostHashValue
			this.server=this.serverList.getServer(hostHashValue)
			if (hostHashValue!=null) this.serverHash=`host=`+escapeHash(hostHashValue)
		}
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
		window.addEventListener('hashchange',()=>{
			const [queryHash,mapHashValue,hostHashValue]=this.getAllHashes()
			if (!this.server) {
				if (hostHashValue!=this.hostHashValue) location.reload()
				return
			}
			if (hostHashValue!=this.serverList.getHostHashValue(this.server)) {
				location.reload()
				return
			}
			if (mapHashValue) {
				this.onMapHashChange(mapHashValue)
			}
			if (this.onQueryHashChange) {
				this.onQueryHashChange(queryHash) // TODO don't run if only map hash changed? or don't zoom to notes if map hash present?
			}
		})
	}
	triggerInitialMapHashChange(): void {
		const [,mapHashValue]=this.getAllHashes()
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
		return this.getAllHashes()[0]
	}
	setQueryHash(queryHash: string, pushStateAndRemoveMapHash: boolean): void {
		if (!this.server) return
		let mapHashValue=''
		if (!pushStateAndRemoveMapHash) {
			const searchParams=getHashSearchParams()
			mapHashValue=searchParams.get('map')??''
		}
		const hostHashValue=this.serverList.getHostHashValue(this.server)
		const fullHash=this.getFullHash(queryHash,mapHashValue,hostHashValue)
		if (fullHash!=location.hash) {
			const url=fullHash||location.pathname+location.search
			if (pushStateAndRemoveMapHash) {
				history.pushState(null,'',url)
			} else {
				history.replaceState(null,'',url)
			}
		}
	}
	hasMapHash(): boolean {
		const searchParams=getHashSearchParams()
		const mapHashValue=searchParams.get('map')
		return !!mapHashValue
	}
	setMapHash(mapHash: string): void {
		const searchParams=getHashSearchParams()
		searchParams.delete('map')
		const hostHash=searchParams.get('host')
		searchParams.delete('host')
		const queryHash=searchParams.toString()
		history.replaceState(null,'',this.getFullHash(queryHash,mapHash,hostHash))
	}
	hasServer(): this is GlobalHistoryWithServer {
		return !!this.server
	}
	private getAllHashes(): [queryHash: string, mapHashValue: string|null, hostHashValue: string|null] {
		const searchParams=getHashSearchParams()
		const mapHashValue=searchParams.get('map')
		searchParams.delete('map')
		const hostHashValue=searchParams.get('host')
		searchParams.delete('host')
		const queryHash=searchParams.toString()
		return [queryHash,mapHashValue,hostHashValue]
	}
	private getFullHash(queryHash: string, mapHashValue: string, hostHashValue: string|null): string {
		let fullHash=''
		const appendToFullHash=(hash:string)=>{
			if (fullHash && hash) fullHash+='&'
			fullHash+=hash
		}
		if (hostHashValue) appendToFullHash('host='+escapeHash(hostHashValue))
		appendToFullHash(queryHash)
		if (mapHashValue) appendToFullHash('map='+escapeHash(mapHashValue))
		if (fullHash) fullHash='#'+fullHash
		return fullHash
	}
	private onMapHashChange(mapHashValue: string) {
		const [zoom,lat,lon]=mapHashValue.split('/')
		bubbleCustomEvent(this.$root,'osmNoteViewer:mapMoveTrigger',{zoom,lat,lon})
	}
}
