import ServerList from './server-list'
import Server from './server'
import {escapeHash} from './escape'

const scrollRestorerEnabled=true // almost works without this, just won't restore position correctly on forward

export default class GlobalHistory {
	onMapHashChange?: (mapHash: string) => void
	onQueryHashChange?: (queryHash: string) => void
	private rememberScrollPosition=false
	public readonly server: Server|undefined
	constructor(
		private readonly $scrollingPart: HTMLElement,
		private readonly $resizeObservationTarget: HTMLElement,
		private readonly serverList: ServerList
	) {
		this.server=this.getServerByReadingHash()
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
			const [queryHash,mapHash,hostHash]=this.getAllHashes()
			if (!this.server) {
				if (hostHash) location.reload()
				return
			}
			if (hostHash!=this.serverList.getHostHash(this.server)) {
				location.reload()
				return
			}
			if (this.onMapHashChange && mapHash) {
				this.onMapHashChange(mapHash)
			}
			if (this.onQueryHashChange) {
				this.onQueryHashChange(queryHash) // TODO don't run if only map hash changed? or don't zoom to notes if map hash present?
			}
		})
	}
	triggerInitialMapHashChange() {
		const [,mapHash]=this.getAllHashes()
		if (this.onMapHashChange && mapHash) {
			this.onMapHashChange(mapHash)
		}
	}
	restoreScrollPosition(): void {
		if (!scrollRestorerEnabled) return
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
		let mapHash=''
		if (!pushStateAndRemoveMapHash) {
			const searchParams=this.getSearchParams()
			mapHash=searchParams.get('map')??''
		}
		const hostHash=this.serverList.getHostHash(this.server)
		const fullHash=this.getFullHash(queryHash,mapHash,hostHash)
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
		const searchParams=this.getSearchParams()
		const mapHash=searchParams.get('map')
		return !!mapHash
	}
	setMapHash(mapHash: string): void {
		const searchParams=this.getSearchParams()
		searchParams.delete('map')
		const hostHash=searchParams.get('host')
		searchParams.delete('host')
		const queryHash=searchParams.toString()
		history.replaceState(null,'',this.getFullHash(queryHash,mapHash,hostHash))
	}
	private getServerByReadingHash(): Server|undefined {
		const [,,hostHash]=this.getAllHashes()
		return this.serverList.getServer(hostHash)
	}
	private getAllHashes(): [queryHash: string, mapHash: string|null, hostHash: string|null] {
		const searchParams=this.getSearchParams()
		const mapHash=searchParams.get('map')
		searchParams.delete('map')
		const hostHash=searchParams.get('host')
		searchParams.delete('host')
		const queryHash=searchParams.toString()
		return [queryHash,mapHash,hostHash]
	}
	private getSearchParams(): URLSearchParams {
		const paramString = (location.hash[0]=='#')
			? location.hash.slice(1)
			: location.hash
		return new URLSearchParams(paramString)
	}
	private getFullHash(queryHash: string, mapHash: string, hostHash: string|null): string {
		let fullHash=''
		const appendToFullHash=(hash:string)=>{
			if (fullHash && hash) fullHash+='&'
			fullHash+=hash
		}
		if (hostHash) appendToFullHash('host='+escapeHash(hostHash))
		appendToFullHash(queryHash)
		if (mapHash) appendToFullHash('map='+escapeHash(mapHash))
		if (fullHash) fullHash='#'+fullHash
		return fullHash
	}
}
