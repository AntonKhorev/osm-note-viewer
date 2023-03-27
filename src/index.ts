import type {Note, Users} from './data'
import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import {HashServerSelector} from './hash'
import Net, {checkAuthRedirect, Server} from './net'
import GlobalEventsListener from './events'
import GlobalHistory from './history'
import Auth from './auth'
import NoteMap from './map'
import OverlayDialog, {makeMenuButton} from './overlay'
import SidebarResizer from './resizer'
import Navbar from './navbar'
import NoteFetchPanel from './fetch-panel'
import NoteFilterPanel from './filter-panel'
import NoteTable from './table'
import ToolPanel from './tool-panel'
import fetchTableNote, {getFetchTableNoteErrorMessage} from './fetch-note'
import OsmDownloader from './osm-downloader'
import TimeTitleUpdater from './time-title-updater'
import {makeDiv} from './util/html'
import {bubbleCustomEvent} from './util/events'
import serverListConfig from './server-list-config'

main()

async function main() {
	if (checkAuthRedirect()) {
		return
	}

	const $root=makeDiv('ui')()
	document.body.append($root)
	new GlobalEventsListener($root)
	
	const storage=new NoteViewerStorage('osm-note-viewer-')
	const db=await NoteViewerDB.open()
	const net=new Net(storage,serverListConfig,serverList=>new HashServerSelector(serverList))
	let auth: Auth|undefined
	const $menuButton=makeMenuButton()

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
	const globalHistory=new GlobalHistory($root,$scrollingPart,net)
	if (net.server) {
		$root.classList.add('with-sidebar')
		auth=new Auth(storage,net.server,net.serverSelector)
		const $textSide=makeDiv('text-side')($scrollingPart,$stickyPart)
		$graphicSide.before($textSide)
		const sidebarResizer=new SidebarResizer($root,$textSide,storage)
		$graphicSide.append(sidebarResizer.$button,$mapContainer)
		map=writeMap($root,$mapContainer,net.server,globalHistory)
		sidebarResizer.startListening(map)
		const navbar=new Navbar($root,storage,$navbarContainer,map)
		const noteTable=writeBelowFetchPanel(
			$root,
			$scrollingPart,$stickyPart,$moreContainer,
			storage,auth,net.server,globalHistory,
			map
		)
		new NoteFetchPanel(
			$root,
			db,auth,
			$fetchContainer,$moreContainer,
			navbar,noteTable,map,
			globalHistory.getQueryHash(),globalHistory.hasMapHash(),
			net.serverSelector.getHostHashValue(net.server)
		)
	}
	
	{
		const overlayDialog=new OverlayDialog(
			$root,
			storage,db,
			net,auth,
			map,$menuButton
		)
		$graphicSide.append(
			overlayDialog.$menuPanel,
			overlayDialog.$figureDialog
		)
	}

	if (net.server) {
		const server=net.server
		$root.addEventListener('osmNoteViewer:updateNoteLinkClick',async(ev)=>{
			const $a=ev.target
			if (!($a instanceof HTMLAnchorElement)) return
			const id=Number($a.dataset.noteId)
			bubbleCustomEvent($a,'osmNoteViewer:beforeNoteFetch',id)
			let note: Note
			let users: Users
			try {
				[note,users]=await fetchTableNote(server.api,id,auth?.token)
			} catch (ex) {
				bubbleCustomEvent($a,'osmNoteViewer:failedNoteFetch',[id,getFetchTableNoteErrorMessage(ex)])
				return
			}
			bubbleCustomEvent($a,'osmNoteViewer:noteFetch',[note,users,'manual'])
			bubbleCustomEvent($a,'osmNoteViewer:noteUpdatePush',[note,users])
		})
		new OsmDownloader($root,server)
		globalHistory.restoreScrollPosition()
	}

	new TimeTitleUpdater($root)
}

function writeMap(
	$root: HTMLElement,
	$mapContainer: HTMLElement,
	server: Server,
	globalHistory: GlobalHistory
) {
	const map=new NoteMap(
		$root,$mapContainer,server
	)
	globalHistory.triggerInitialMapHashChange()
	return map
}

function writeBelowFetchPanel(
	$root: HTMLElement,
	$scrollingPart: HTMLElement, $stickyPart: HTMLElement, $moreContainer: HTMLElement,
	storage: NoteViewerStorage, auth: Auth, server: Server, globalHistory: GlobalHistory,
	map: NoteMap
): NoteTable {
	const $filterContainer=makeDiv('panel','fetch')()
	const $notesContainer=makeDiv('notes')()
	$scrollingPart.append($filterContainer,$notesContainer,$moreContainer)
	const filterPanel=new NoteFilterPanel(storage,server.api,server.web,$filterContainer)
	const $toolContainer=makeDiv('panel','toolbar')()
	$stickyPart.append($toolContainer)

	new ToolPanel(
		$root,$toolContainer,
		storage,auth,map
	)
	const noteTable=new NoteTable(
		$root,$notesContainer,
		storage,map,filterPanel.noteFilter,
		server
	)
	filterPanel.onFilterUpdate=noteFilter=>noteTable.updateFilter(noteFilter)
	globalHistory.$resizeObservationTarget=$notesContainer

	return noteTable
}
