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
	new GlobalEventsListener()

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
	let noteTable: NoteTable|undefined
	let toolPanel: ToolPanel|undefined
	if (globalHistory.hasServer()) {
		auth=new Auth(storage,globalHistory.server,serverList)
		map=writeGraphicSide(globalHistory)
		;[noteTable,toolPanel]=writeBelowFetchPanel(
			$scrollingPart,$stickyPart,$moreContainer,
			storage,auth,globalHistory,
			map
		)
	} else {
		document.body.classList.add('only-text-side')
	}
	const navbar=new Navbar(storage,$navbarContainer,map)
	const fetchPanel=new NoteFetchPanel(
		document.body,
		storage,db,globalHistory,auth,
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
		document.body.addEventListener('osmNoteViewer:clickUpdateNoteLink',async(ev)=>{
			const $a=ev.target
			if (!($a instanceof HTMLAnchorElement)) return
			try {
				const [note,users]=await fetchTableNote(globalHistory.server.api,$a,Number($a.dataset.noteId),auth?.token)
				await fetchPanel.fetcherRun?.updateNote(note,users)
				noteTable?.replaceNote(note,users)
			} catch {}
		})
	}
	globalHistory.restoreScrollPosition()
}

function writeGraphicSide(
	globalHistory:GlobalHistoryWithServer
): NoteMap {
	const $graphicSide=makeDiv('graphic-side')()
	const $mapContainer=makeDiv('map')()
	const $figureDialog=document.createElement('dialog')
	$figureDialog.classList.add('figure')
	$graphicSide.append($mapContainer,$figureDialog)
	document.body.append($graphicSide)

	const map=new NoteMap(
		document.body,$mapContainer,globalHistory.server.tile,
		(changesetId)=>downloadAndShowChangeset(globalHistory.server,changesetId),
		(elementType,elementId)=>downloadAndShowElement(globalHistory.server,elementType,elementId)
	)
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
	new FigureDialog(document.body,$figureDialog)

	return map
}

function writeBelowFetchPanel(
	$scrollingPart:HTMLElement, $stickyPart:HTMLElement, $moreContainer:HTMLElement,
	storage:NoteViewerStorage, auth:Auth, globalHistory:GlobalHistoryWithServer,
	map:NoteMap
): [NoteTable,ToolPanel] {
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

	return [noteTable,toolPanel]
}
