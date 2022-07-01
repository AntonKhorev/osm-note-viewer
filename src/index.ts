import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import GlobalEventsListener from './events'
import {NoteMap} from './map'
import FigureDialog from './figure'
import Navbar from './navbar'
import NoteFetchPanel from './fetch-panel'
import NoteFilterPanel from './filter-panel'
import NoteTable from './table'
import ToolPanel from './tool-panel'
import {downloadAndShowChangeset, downloadAndShowElement} from './osm'
import {makeDiv} from './util'

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
	const globalEventsListener=new GlobalEventsListener()

	const $navbarContainer=document.createElement('nav')
	const $fetchContainer=makeDiv('panel','fetch')()
	const $filterContainer=makeDiv('panel','fetch')()
	const $notesContainer=makeDiv('notes')()
	const $moreContainer=makeDiv('more')()
	const $toolContainer=makeDiv('panel','command')()
	const $mapContainer=makeDiv('map')()
	const $figureDialog=document.createElement('dialog')
	$figureDialog.classList.add('figure')

	const $scrollingPart=makeDiv('scrolling')($navbarContainer,$fetchContainer,$filterContainer,$notesContainer,$moreContainer)
	const $stickyPart=makeDiv('sticky')($toolContainer)

	const $textSide=makeDiv('text-side')($scrollingPart,$stickyPart)
	const $graphicSide=makeDiv('graphic-side')($mapContainer,$figureDialog)
	const flipped=!!storage.getItem('flipped')
	if (flipped) document.body.classList.add('flipped')
	document.body.append($textSide,$graphicSide)

	const scrollRestorer=new ScrollRestorer($scrollingPart)
	const map=new NoteMap($mapContainer)
	const figureDialog=new FigureDialog($figureDialog)
	globalEventsListener.elementListener=($a,elementType,elementId)=>{
		if (elementType!='node' && elementType!='way' && elementType!='relation') return false
		figureDialog.close()
		downloadAndShowElement($a,map,elementType,elementId)
	}
	globalEventsListener.changesetListener=($a,changesetId)=>{
		figureDialog.close()
		downloadAndShowChangeset($a,map,changesetId)
	}

	const navbar=new Navbar(storage,$navbarContainer,map)
	const filterPanel=new NoteFilterPanel($filterContainer)
	const toolPanel=new ToolPanel(storage,globalEventsListener,$toolContainer,map,figureDialog)
	const noteTable=new NoteTable(
		$notesContainer,toolPanel,map,filterPanel.noteFilter,
		figureDialog
	)
	const fetchPanel=new NoteFetchPanel(
		storage,db,globalEventsListener,
		$fetchContainer,$moreContainer,
		navbar,filterPanel,
		noteTable,map,figureDialog,
		()=>scrollRestorer.run($notesContainer)
	)
	scrollRestorer.run($notesContainer)
}
