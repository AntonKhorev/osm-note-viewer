import type {Note, Users} from './data'
import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import ServerList from './server-list'
import GlobalEventsListener from './events'
import GlobalHistory, {GlobalHistoryWithServer} from './history'
import Auth, {checkAuthRedirect} from './auth'
import NoteMap from './map'
import OverlayDialog from './overlay'
import Navbar from './navbar'
import NoteFetchPanel from './fetch-panel'
import NoteFilterPanel from './filter-panel'
import NoteTable from './table'
import ToolPanel from './tool-panel'
import fetchTableNote, {getFetchTableNoteErrorMessage} from './fetch-note'
import {downloadAndShowChangeset, downloadAndShowElement} from './osm'
import {bubbleCustomEvent, bubbleEvent, makeDiv} from './html'
import serverListConfig from './server-list-config'

main()

async function main() {
	if (checkAuthRedirect()) {
		return
	}

	const storage=new NoteViewerStorage('osm-note-viewer-')
	const db=await NoteViewerDB.open()
	const serverListConfigSources:unknown[]=[serverListConfig]
	try {
		const customServerListConfig=storage.getItem('servers')
		if (customServerListConfig!=null) {
			serverListConfigSources.push(JSON.parse(customServerListConfig))
		}
	} catch {}
	const serverList=new ServerList(...serverListConfigSources)
	new GlobalEventsListener()
	let auth: Auth|undefined

	const $navbarContainer=document.createElement('nav')
	const $fetchContainer=makeDiv('panel','fetch')()
	const $moreContainer=makeDiv('more')()
	const $scrollingPart=makeDiv('scrolling')($navbarContainer,$fetchContainer)
	const $stickyPart=makeDiv('sticky')()
	const $graphicSide=makeDiv('graphic-side')(makeMenuButton())
	const $mapContainer=makeDiv('map')()
	document.body.append($graphicSide)

	const flipped=storage.getBoolean('flipped')
	if (flipped) document.body.classList.add('flipped')

	const globalHistory=new GlobalHistory($scrollingPart,serverList)
	if (globalHistory.hasServer()) {
		auth=new Auth(storage,globalHistory.server,serverList)
		document.body.append(makeDiv('text-side')($scrollingPart,$stickyPart))
		$graphicSide.append($mapContainer)
		const map=writeMap($mapContainer,globalHistory)
		const navbar=new Navbar(storage,$navbarContainer,map)
		const noteTable=writeBelowFetchPanel(
			$scrollingPart,$stickyPart,$moreContainer,
			storage,auth,globalHistory,
			map
		)
		new NoteFetchPanel(
			document.body,
			db,globalHistory,
			$fetchContainer,$moreContainer,
			navbar,noteTable,map
		)
	} else {
		document.body.classList.add('only-graphic-side')
	}
	
	{
		const overlayDialog=new OverlayDialog(
			document.body,
			storage,db,
			globalHistory.server,serverList,globalHistory.serverHash,
			auth,$mapContainer
		)
		$graphicSide.append(
			overlayDialog.$menuPanel,
			overlayDialog.$figureDialog
		)
	}

	if (globalHistory.hasServer()) {
		document.body.addEventListener('osmNoteViewer:clickUpdateNoteLink',async(ev)=>{
			const $a=ev.target
			if (!($a instanceof HTMLAnchorElement)) return
			const id=Number($a.dataset.noteId)
			bubbleCustomEvent($a,'osmNoteViewer:beforeNoteFetch',id)
			let note: Note
			let users: Users
			try {
				[note,users]=await fetchTableNote(globalHistory.server.api,id,auth?.token)
			} catch (ex) {
				bubbleCustomEvent($a,'osmNoteViewer:failedNoteFetch',[id,getFetchTableNoteErrorMessage(ex)])
				return
			}
			bubbleCustomEvent($a,'osmNoteViewer:noteFetch',[note,users])
			bubbleCustomEvent($a,'osmNoteViewer:pushNoteUpdate',[note,users])
		})
		globalHistory.restoreScrollPosition()
	}
}

function writeMap(
	$mapContainer: HTMLElement,
	globalHistory: GlobalHistoryWithServer
) {
	const map=new NoteMap(
		document.body,$mapContainer,globalHistory.server.tile,
		(changesetId)=>downloadAndShowChangeset(globalHistory.server,changesetId),
		(elementType,elementId)=>downloadAndShowElement(globalHistory.server,elementType,elementId)
	)
	map.onMoveEnd(()=>{
		globalHistory.setMapHash(map.hash)
	})
	globalHistory.onMapHashChange=(mapHashValue: string)=>{
		const [zoomString,latString,lonString]=mapHashValue.split('/')
		if (zoomString && latString && lonString) {
			map.panAndZoomTo([Number(latString),Number(lonString)],Number(zoomString))
		}
	}
	globalHistory.triggerInitialMapHashChange()
	return map
}

function writeBelowFetchPanel(
	$scrollingPart: HTMLElement, $stickyPart: HTMLElement, $moreContainer: HTMLElement,
	storage: NoteViewerStorage, auth: Auth, globalHistory: GlobalHistoryWithServer,
	map: NoteMap
): NoteTable {
	const $filterContainer=makeDiv('panel','fetch')()
	const $notesContainer=makeDiv('notes')()
	$scrollingPart.append($filterContainer,$notesContainer,$moreContainer)
	const filterPanel=new NoteFilterPanel(globalHistory.server,$filterContainer)
	const $toolContainer=makeDiv('panel','command')()
	$stickyPart.append($toolContainer)

	const toolPanel=new ToolPanel(
		document.body,$toolContainer,
		storage,auth,map
	)
	const noteTable=new NoteTable(
		document.body,
		$notesContainer,toolPanel,map,filterPanel.noteFilter,
		globalHistory.server
	)
	filterPanel.subscribe(noteFilter=>noteTable.updateFilter(noteFilter))
	globalHistory.$resizeObservationTarget=$notesContainer

	return noteTable
}

function makeMenuButton(): HTMLButtonElement {
	const $button=document.createElement('button')
	$button.title=`Menu`
	$button.classList.add('global','menu')
	$button.innerHTML=`<svg><use href="#menu" /></svg>`
	$button.onclick=()=>{
		bubbleEvent($button,'osmNoteViewer:toggleMenu')
	}
	return $button
}
