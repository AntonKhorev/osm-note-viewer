import type {Note, Users} from './data'
import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import Net, {checkAuthRedirect, Connection, HashServerSelector} from './net'
import GlobalEventsListener from './events'
import GlobalHistory from './history'
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
import {bubbleEvent, bubbleCustomEvent} from './util/events'
import serverListConfig from './server-list-config'

main()

async function main() {
	if (checkAuthRedirect()) {
		return
	}

	const $root=makeDiv('ui')()
	document.body.append($root)
	new GlobalEventsListener($root)
	
	const storage=new NoteViewerStorage()
	const db=await NoteViewerDB.open()
	const net=new Net(
		`osm-note-viewer`,'read_prefs write_notes',
		[`You need to login if you'd like to manipulate notes.`],
		serverListConfig,
		storage,
		serverList=>new HashServerSelector(serverList),
		()=>bubbleEvent($root,'osmNoteViewer:loginChange')
	)
	const $menuButton=makeMenuButton()

	const $navbarContainer=document.createElement('nav')
	const $fetchContainer=makeDiv('panel','fetch')()
	const $moreContainer=makeDiv('more')()
	const $scrollingPart=makeDiv('scrolling')($navbarContainer,$fetchContainer)
	const $stickyPart=makeDiv('sticky')()
	const $graphicSide=makeDiv('graphic-side')($menuButton)
	const $mapContainer=makeDiv('map')()
	$root.append($graphicSide)

	let map: NoteMap|undefined
	const globalHistory=new GlobalHistory($root,$scrollingPart,net)
	if (net.cx) {
		const $textSide=makeDiv('text-side')($scrollingPart,$stickyPart)
		$graphicSide.before($textSide)
		const sidebarResizer=new SidebarResizer($root,$textSide,storage)
		$graphicSide.append(sidebarResizer.$button,$mapContainer)
		map=new NoteMap(
			$root,$mapContainer,net.cx.server,storage
		)
		globalHistory.triggerInitialMapHashChange()
		sidebarResizer.startListening(map)
		const noteTable=writeBelowFetchPanel(
			$root,
			$scrollingPart,$stickyPart,$moreContainer,
			storage,net.cx,globalHistory,
			map
		)
		const navbar=new Navbar($root,$navbarContainer,noteTable,map)
		new NoteFetchPanel(
			$root,
			db,net.cx,
			$fetchContainer,$moreContainer,
			navbar,noteTable,map,
			net.serverSelector.getHostHashValueForServer(net.cx.server),
			globalHistory.getQueryHash(),()=>globalHistory.getMapHashValue()
		)
		$mapContainer.addEventListener('keydown',ev=>{
			if (ev.key!='Escape') return
			noteTable.focusBody()
			ev.stopPropagation()
			ev.preventDefault()
		})
	}
	
	{
		const overlayDialog=new OverlayDialog(
			$root,
			storage,db,net,
			map,$menuButton
		)
		$graphicSide.append(
			overlayDialog.$message,
			overlayDialog.$menuPanel,
			overlayDialog.$figureDialog
		)
	}

	if (net.cx) {
		const server=net.cx.server
		$root.addEventListener('osmNoteViewer:updateNoteLinkClick',async(ev)=>{
			const $a=ev.target
			if (!($a instanceof HTMLAnchorElement)) return
			const id=Number($a.dataset.noteId)
			bubbleCustomEvent($a,'osmNoteViewer:beforeNoteFetch',id)
			let note: Note
			let users: Users
			try {
				[note,users]=await fetchTableNote(server.api,id,net.cx?.token)
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

function writeBelowFetchPanel(
	$root: HTMLElement,
	$scrollingPart: HTMLElement, $stickyPart: HTMLElement, $moreContainer: HTMLElement,
	storage: NoteViewerStorage, cx: Connection, globalHistory: GlobalHistory,
	map: NoteMap
): NoteTable {
	const $filterContainer=makeDiv('panel','fetch')()
	const $notesContainer=makeDiv('notes')()
	$scrollingPart.append($filterContainer,$notesContainer,$moreContainer)
	const filterPanel=new NoteFilterPanel(storage,cx.server.api,cx.server.web,$filterContainer)
	const $toolContainer=makeDiv('panel','toolbar')()
	$stickyPart.append($toolContainer)

	new ToolPanel(
		$root,$toolContainer,
		storage,cx,map
	)
	const noteTable=new NoteTable(
		$root,$notesContainer,
		storage,map,filterPanel.noteFilter,
		cx.server.web
	)
	filterPanel.onFilterUpdate=noteFilter=>noteTable.updateFilter(noteFilter)
	globalHistory.$resizeObservationTarget=$notesContainer

	return noteTable
}
