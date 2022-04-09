import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import {NoteMap} from './map'
import NoteFetchPanel from './fetch-panel'
import NoteFilterPanel from './filter-panel'
import ExtrasPanel from './extras-panel'

class ScrollRestorer {
	constructor() {
		history.scrollRestoration='manual'
	}
	run($scrollingPart: HTMLElement, $resizeObservationTarget: HTMLElement): void {
		let nRestoreScrollPositionAttempts=0
		const resizeObserver=new ResizeObserver(()=>{
			if (tryToRestoreScrollPosition()) {
				resizeObserver.disconnect()
			}
		})
		resizeObserver.observe($resizeObservationTarget) // observing $scrollingPart won't work because its size doesn't change
		function tryToRestoreScrollPosition(): boolean {
			if (++nRestoreScrollPositionAttempts>10) return true
			if (!history.state) return true
			const needToScrollTo=history.state.scrollPosition
			if (typeof needToScrollTo != 'number') return true
			const canScrollTo=$scrollingPart.scrollHeight-$scrollingPart.clientHeight
			if (needToScrollTo>canScrollTo) return false
			$scrollingPart.scrollTop=needToScrollTo
			$scrollingPart.addEventListener('scroll',()=>{
				const scrollPosition=$scrollingPart.scrollTop
				history.replaceState({scrollPosition},'')
				// TODO save more panel open/closed state... actually all panels open/closed states - Firefox does that, Chrome doesn't
				// ... or save some other kind of position relative to notes table instead of scroll
			})
			return true
		}
	}
}

const scrollRestorer=new ScrollRestorer()

main()

async function main() {
	const storage=new NoteViewerStorage('osm-note-viewer-')
	const db=await NoteViewerDB.open()

	const flipped=!!storage.getItem('flipped')
	if (flipped) document.body.classList.add('flipped')
	const $textSide=document.createElement('div')
	$textSide.id='text'
	const $mapSide=document.createElement('div')
	$mapSide.id='map'
	document.body.append($textSide,$mapSide)

	const $scrollingPart=document.createElement('div')
	$scrollingPart.classList.add('scrolling')
	const $stickyPart=document.createElement('div')
	$stickyPart.classList.add('sticky')
	$textSide.append($scrollingPart,$stickyPart)

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

	const map=new NoteMap($mapSide)
	writeFlipLayoutButton(storage,$fetchContainer,map)
	writeResetButton($fetchContainer)
	const extrasPanel=new ExtrasPanel(storage,db,$extrasContainer)
	const filterPanel=new NoteFilterPanel($filterContainer)
	const fetchPanel=new NoteFetchPanel()
	scrollRestorer.run($scrollingPart,$notesContainer)
	await fetchPanel.run(storage,db,$fetchContainer,$notesContainer,$moreContainer,$commandContainer,filterPanel,extrasPanel,map)
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
