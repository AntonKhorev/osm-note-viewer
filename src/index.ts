import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import {NoteMap} from './map'
import NoteFetchPanel from './fetch-panel'
import NoteFilterPanel from './filter-panel'
import ExtrasPanel from './extras-panel'

history.scrollRestoration='manual'

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

	function logHeight(type: string): void {
		console.log(`> ${type} content height = ${$scrollingPart.scrollHeight} ; window height = ${$scrollingPart.clientHeight} ; able to scroll to = ${$scrollingPart.scrollHeight-$scrollingPart.clientHeight}`)
	}

	logHeight('initial')

	await fetchPanel.run(storage,db,$fetchContainer,$notesContainer,$moreContainer,$commandContainer,filterPanel,extrasPanel,map)

	let nRestoreScrollPositionAttempts=0
	tryToRestoreScrollPosition()

	function tryToRestoreScrollPosition() { // https://stackoverflow.com/a/38029067 + checking how far can actually scroll
		if (++nRestoreScrollPositionAttempts>10) return
		logHeight('try '+nRestoreScrollPositionAttempts)
		if (!history.state) return
		const needToScrollTo=history.state.scrollPosition
		if (typeof needToScrollTo != 'number') return
		const canScrollTo=$scrollingPart.scrollHeight-$scrollingPart.clientHeight
		if (needToScrollTo>canScrollTo) {
			// setTimeout(tryToRestoreScrollPosition,1000)
			window.requestAnimationFrame(tryToRestoreScrollPosition)
			// window.requestAnimationFrame(()=>setTimeout(tryToRestoreScrollPosition,10))
			return
		}
		$scrollingPart.scrollTop=needToScrollTo
		console.log('scrolled to:',$scrollingPart.scrollTop) ///
		$scrollingPart.addEventListener('scroll',()=>{
			const scrollPosition=$scrollingPart.scrollTop
			history.replaceState({scrollPosition},'')
			console.log('saved scroll:',scrollPosition) ///
		})
	}
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
