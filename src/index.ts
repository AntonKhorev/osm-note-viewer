import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import {NoteMap} from './map'
import NoteFetchPanel from './fetch-panel'
import NoteFilterPanel from './filter-panel'
import ExtrasPanel from './extras-panel'

const scrollRestorerEnabled=true

class ScrollRestorer {
	private rememberScrollPosition=false
	constructor(private $scrollingPart: HTMLElement) {
		if (!scrollRestorerEnabled) return
		history.scrollRestoration='manual'
		$scrollingPart.addEventListener('scroll',()=>{
			if (!this.rememberScrollPosition) return
			const scrollPosition=$scrollingPart.scrollTop
			history.replaceState({scrollPosition},'')
			// TODO save more panel open/closed state... actually all panels open/closed states - Firefox does that, Chrome doesn't
			// ... or save some other kind of position relative to notes table instead of scroll
		})
	}
	run($resizeObservationTarget: HTMLElement): void {
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
		resizeObserver.observe($resizeObservationTarget) // observing $scrollingPart won't work because its size doesn't change
	}
}

main()

async function main() {
	const storage=new NoteViewerStorage('osm-note-viewer-')
	const db=await NoteViewerDB.open()

	const flipped=!!storage.getItem('flipped')
	if (flipped) document.body.classList.add('flipped')
	const $textSide=document.createElement('div')
	$textSide.classList.add('text-side')
	const $graphicSide=document.createElement('div')
	$graphicSide.classList.add('graphic-side')
	document.body.append($textSide,$graphicSide)

	const $scrollingPart=document.createElement('div')
	$scrollingPart.classList.add('scrolling')
	const $stickyPart=document.createElement('div')
	$stickyPart.classList.add('sticky')
	$textSide.append($scrollingPart,$stickyPart)
	const scrollRestorer=new ScrollRestorer($scrollingPart)

	const $fetchContainer=document.createElement('div')
	$fetchContainer.classList.add('panel','fetch')
	const $filterContainer=document.createElement('div')
	$filterContainer.classList.add('panel','fetch')
	const $extrasContainer=document.createElement('div')
	$extrasContainer.classList.add('panel')
	const $notesContainer=document.createElement('div')
	$notesContainer.classList.add('notes')
	const $moreContainer=document.createElement('div')
	$moreContainer.classList.add('more')
	const $commandContainer=document.createElement('div')
	$commandContainer.classList.add('panel','command')
	
	$scrollingPart.append($fetchContainer,$filterContainer,$extrasContainer,$notesContainer,$moreContainer)
	$stickyPart.append($commandContainer)

	const $mapContainer=document.createElement('div')
	$mapContainer.classList.add('map')
	$graphicSide.append($mapContainer)

	const map=new NoteMap($mapContainer)

	writeFlipLayoutButton(storage,$fetchContainer,map)
	writeResetButton($fetchContainer)
	const extrasPanel=new ExtrasPanel(storage,db,$extrasContainer)
	const filterPanel=new NoteFilterPanel($filterContainer)
	const fetchPanel=new NoteFetchPanel(
		storage,db,
		$fetchContainer,$notesContainer,$moreContainer,$commandContainer,
		filterPanel,extrasPanel,map,
		()=>scrollRestorer.run($notesContainer)
	)
	scrollRestorer.run($notesContainer)
}

function writeFlipLayoutButton(storage: NoteViewerStorage, $container: HTMLElement, map: NoteMap): void {
	const $button=document.createElement('button')
	$button.classList.add('flip')
	$button.title=`Flip layout`
	$button.addEventListener('click',()=>{
		document.body.classList.toggle('flipped')
		if (document.body.classList.contains('flipped')) {
			storage.setItem('flipped','1')
		} else {
			storage.removeItem('flipped')
		}
		map.invalidateSize()
	})
	$container.append($button)
}

function writeResetButton($container: HTMLElement): void {
	const $button=document.createElement('button')
	$button.classList.add('reset')
	$button.title=`Reset query`
	$button.addEventListener('click',()=>{
		location.href=location.pathname+location.search
	})
	$container.append($button)
}
