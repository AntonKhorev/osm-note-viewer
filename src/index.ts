import type {Note, Users} from './data'
import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import ServerList from './server-list'
import GlobalEventsListener from './events'
import GlobalHistory, {GlobalHistoryWithServer} from './history'
import Auth, {checkAuthRedirect} from './auth'
import NoteMap from './map'
import OverlayDialog, {makeMenuButton} from './overlay'
import Navbar from './navbar'
import NoteFetchPanel from './fetch-panel'
import NoteFilterPanel from './filter-panel'
import NoteTable from './table'
import ToolPanel from './tool-panel'
import fetchTableNote, {getFetchTableNoteErrorMessage} from './fetch-note'
import {downloadAndShowChangeset, downloadAndShowElement} from './osm'
import {bubbleCustomEvent, makeDiv} from './html'
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
	const $menuButton=makeMenuButton()

	const $root=document.body
	const $navbarContainer=document.createElement('nav')
	const $fetchContainer=makeDiv('panel','fetch')()
	const $moreContainer=makeDiv('more')()
	const $scrollingPart=makeDiv('scrolling')($navbarContainer,$fetchContainer)
	const $stickyPart=makeDiv('sticky')()
	const $graphicSide=makeDiv('graphic-side')($menuButton)
	const $mapContainer=makeDiv('map')()
	$root.append($graphicSide)

	const flipped=storage.getBoolean('flipped')
	if (flipped) $root.classList.add('flipped')

	let map: NoteMap|undefined
	const globalHistory=new GlobalHistory($root,$scrollingPart,serverList)
	if (globalHistory.hasServer()) {
		auth=new Auth(storage,globalHistory.server,serverList)
		$graphicSide.before(makeDiv('text-side')($scrollingPart,$stickyPart))
		$graphicSide.append($mapContainer)
		map=writeMap($root,$mapContainer,globalHistory)
		const navbar=new Navbar(storage,$navbarContainer,map)
		const noteTable=writeBelowFetchPanel(
			$root,
			$scrollingPart,$stickyPart,$moreContainer,
			storage,auth,globalHistory,
			map
		)
		new NoteFetchPanel(
			$root,
			db,auth,
			$fetchContainer,$moreContainer,
			navbar,noteTable,map,
			globalHistory.getQueryHash(),globalHistory.hasMapHash(),
			serverList.getHostHashValue(globalHistory.server)
		)
	}
	
	{
		const overlayDialog=new OverlayDialog(
			$root,
			storage,db,
			globalHistory.server,serverList,globalHistory.serverHash,auth,
			map,$menuButton
		)
		$graphicSide.append(
			overlayDialog.$menuPanel,
			overlayDialog.$figureDialog
		)
	}

	if (globalHistory.hasServer()) {
		$root.addEventListener('osmNoteViewer:updateNoteLinkClick',async(ev)=>{
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
			bubbleCustomEvent($a,'osmNoteViewer:noteFetch',[note,users,'manual'])
			bubbleCustomEvent($a,'osmNoteViewer:noteUpdatePush',[note,users])
		})
		globalHistory.restoreScrollPosition()
	}
}

function writeMap(
	$root: HTMLElement,
	$mapContainer: HTMLElement,
	globalHistory: GlobalHistoryWithServer
) {
	const map=new NoteMap(
		$root,$mapContainer,globalHistory.server.tile,
		(changesetId)=>downloadAndShowChangeset(globalHistory.server,changesetId),
		(elementType,elementId)=>downloadAndShowElement(globalHistory.server,elementType,elementId)
	)
	globalHistory.triggerInitialMapHashChange()
	return map
}

function writeBelowFetchPanel(
	$root: HTMLElement,
	$scrollingPart: HTMLElement, $stickyPart: HTMLElement, $moreContainer: HTMLElement,
	storage: NoteViewerStorage, auth: Auth, globalHistory: GlobalHistoryWithServer,
	map: NoteMap
): NoteTable {
	const $filterContainer=makeDiv('panel','fetch')()
	const $notesContainer=makeDiv('notes')()
	$scrollingPart.append($filterContainer,$notesContainer,$moreContainer)
	const filterPanel=new NoteFilterPanel(storage,globalHistory.server,$filterContainer)
	const $toolContainer=makeDiv('panel','command')()
	$stickyPart.append($toolContainer)

	new ToolPanel(
		$root,$toolContainer,
		storage,auth,map
	)
	const noteTable=new NoteTable(
		$root,
		$notesContainer,map,filterPanel.noteFilter,
		globalHistory.server
	)
	filterPanel.subscribe(noteFilter=>noteTable.updateFilter(noteFilter))
	globalHistory.$resizeObservationTarget=$notesContainer

	return noteTable
}
