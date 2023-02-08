import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import ServerList from './server-list'
import GlobalEventsListener from './events'
import GlobalHistory, {GlobalHistoryWithServer} from './history'
import Auth, {checkAuthRedirect} from './auth'
import NoteMap from './map'
import FigureDialog from './figure'
import Navbar from './navbar'
import NoteFetchPanel from './fetch-panel'
import NoteFilterPanel from './filter-panel'
import NoteTable from './table'
import ToolPanel from './tool-panel'
import fetchTableNote from './fetch-note'
import {downloadAndShowChangeset, downloadAndShowElement} from './osm'
import {makeDiv} from './html'
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
	const globalEventsListener=new GlobalEventsListener()

	const $navbarContainer=document.createElement('nav')
	const $fetchContainer=makeDiv('panel','fetch')()
	const $moreContainer=makeDiv('more')()

	const $scrollingPart=makeDiv('scrolling')($navbarContainer,$fetchContainer)
	const $stickyPart=makeDiv('sticky')()

	const flipped=storage.getBoolean('flipped')
	if (flipped) document.body.classList.add('flipped')
	document.body.append(makeDiv('text-side')($scrollingPart,$stickyPart))

	const globalHistory=new GlobalHistory($scrollingPart,serverList)
	
	let auth: Auth|undefined
	let map: NoteMap|undefined
	let figureDialog: FigureDialog|undefined
	let noteTable: NoteTable|undefined
	let toolPanel: ToolPanel|undefined
	if (globalHistory.hasServer()) {
		auth=new Auth(storage,globalHistory.server,serverList)
		;[map,figureDialog]=writeGraphicSide(globalEventsListener,globalHistory)
		;[noteTable,toolPanel]=writeBelowFetchPanel(
			$scrollingPart,$stickyPart,$moreContainer,
			storage,auth,globalEventsListener,globalHistory,
			map,figureDialog
		)
	} else {
		document.body.classList.add('only-text-side')
	}
	const navbar=new Navbar(storage,$navbarContainer,map)
	const fetchPanel=new NoteFetchPanel(
		document.body,
		storage,db,globalEventsListener,globalHistory,auth,
		$fetchContainer,$moreContainer,
		navbar,noteTable,map
	)
	if (noteTable) {
		noteTable.onRefresherUpdate=async(note,users)=>{
			await fetchPanel.fetcherRun?.updateNote(note,users)
		}
	}
	if (toolPanel) {
		toolPanel.onNoteReload=async(note,users)=>{
			await fetchPanel.fetcherRun?.updateNote(note,users)
			noteTable?.replaceNote(note,users)
		}
	}
	if (globalHistory.hasServer()) {
		globalEventsListener.noteSelfListener=async($a,noteId)=>{
			try {
				const [note,users]=await fetchTableNote(globalHistory.server.api,$a,Number(noteId),auth?.token)
				await fetchPanel.fetcherRun?.updateNote(note,users)
				noteTable?.replaceNote(note,users)
			} catch {}
		}
	}
	globalHistory.restoreScrollPosition()
}

function writeGraphicSide(
	globalEventsListener:GlobalEventsListener, globalHistory:GlobalHistoryWithServer
): [NoteMap,FigureDialog] {
	const $graphicSide=makeDiv('graphic-side')()
	const $mapContainer=makeDiv('map')()
	const $figureDialog=document.createElement('dialog')
	$figureDialog.classList.add('figure')
	$graphicSide.append($mapContainer,$figureDialog)
	document.body.append($graphicSide)

	const map=new NoteMap(document.body,$mapContainer,globalHistory.server.tile)
	map.onMoveEnd(()=>{
		globalHistory.setMapHash(map.hash)
	})
	globalHistory.onMapHashChange=(mapHash: string)=>{
		const [zoomString,latString,lonString]=mapHash.split('/')
		if (zoomString && latString && lonString) {
			map.panAndZoomTo([Number(latString),Number(lonString)],Number(zoomString))
		}
	}
	globalHistory.triggerInitialMapHashChange()
	const figureDialog=new FigureDialog(document.body,$figureDialog)
	globalEventsListener.elementListener=($a,elementType,elementId)=>{
		if (elementType!='node' && elementType!='way' && elementType!='relation') return false
		figureDialog.close()
		downloadAndShowElement($a,globalHistory.server,map,elementType,elementId)
	}
	globalEventsListener.changesetListener=($a,changesetId)=>{
		figureDialog.close()
		downloadAndShowChangeset($a,globalHistory.server,map,changesetId)
	}

	return [map,figureDialog]
}

function writeBelowFetchPanel(
	$scrollingPart:HTMLElement, $stickyPart:HTMLElement, $moreContainer:HTMLElement,
	storage:NoteViewerStorage, auth:Auth, globalEventsListener:GlobalEventsListener, globalHistory:GlobalHistoryWithServer,
	map:NoteMap, figureDialog:FigureDialog
): [NoteTable,ToolPanel] {
	const $filterContainer=makeDiv('panel','fetch')()
	const $notesContainer=makeDiv('notes')()
	$scrollingPart.append($filterContainer,$notesContainer,$moreContainer)
	const filterPanel=new NoteFilterPanel(globalHistory.server,$filterContainer)
	const $toolContainer=makeDiv('panel','command')()
	$stickyPart.append($toolContainer)

	const toolPanel=new ToolPanel(
		storage,auth,globalEventsListener,
		$toolContainer,map,figureDialog
	)
	auth.onLoginChange=()=>toolPanel.receiveLoginChange()
	const noteTable=new NoteTable(
		$notesContainer,toolPanel,map,filterPanel.noteFilter,
		figureDialog,
		globalHistory.server
	)
	globalEventsListener.noteListener=($a,noteId)=>{
		noteTable.pingNoteFromLink($a,noteId)
	}
	filterPanel.subscribe(noteFilter=>noteTable.updateFilter(noteFilter))
	globalHistory.$resizeObservationTarget=$notesContainer

	return [noteTable,toolPanel]
}
