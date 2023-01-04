import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import ServerList from './server-list'
import GlobalEventsListener from './events'
import GlobalHistory from './history'
import {NoteMap} from './map'
import FigureDialog from './figure'
import Navbar from './navbar'
import NoteFetchPanel from './fetch-panel'
import NoteFilterPanel from './filter-panel'
import NoteTable from './table'
import ToolPanel from './tool-panel'
import {downloadAndShowChangeset, downloadAndShowElement} from './osm'
import {makeDiv} from './html'
import Server from './server'
import serverListConfig from './server-list-config'

main()

async function main() {
	const storage=new NoteViewerStorage('osm-note-viewer-')
	const db=await NoteViewerDB.open()
	const serverList=new ServerList(serverListConfig)
	const globalEventsListener=new GlobalEventsListener()

	const $navbarContainer=document.createElement('nav')
	const $fetchContainer=makeDiv('panel','fetch')()
	const $moreContainer=makeDiv('more')()

	const $scrollingPart=makeDiv('scrolling')($navbarContainer,$fetchContainer)
	const $stickyPart=makeDiv('sticky')()

	const $textSide=makeDiv('text-side')($scrollingPart,$stickyPart)
	const $graphicSide=makeDiv('graphic-side')()
	const flipped=!!storage.getItem('flipped')
	if (flipped) document.body.classList.add('flipped')
	document.body.append($textSide,$graphicSide)

	const globalHistory=new GlobalHistory($scrollingPart,serverList)
	const server=globalHistory.server
	let map: NoteMap|undefined
	let figureDialog: FigureDialog|undefined
	if (server) {
		[map,figureDialog]=writeGraphicSide($graphicSide,globalEventsListener,globalHistory,server)
	} else {
		document.body.classList.add('only-text-side')
	}

	const navbar=new Navbar(storage,$navbarContainer,map)
	let noteTable: NoteTable|undefined
	if (server && map && figureDialog) {
		noteTable=writeBelowFetchPanel(
			$scrollingPart,$stickyPart,$moreContainer,
			storage,globalEventsListener,globalHistory,server,
			map,figureDialog
		)
	}
	const fetchPanel=new NoteFetchPanel(
		storage,db,server,serverList,
		globalEventsListener,globalHistory,
		$fetchContainer,$moreContainer,
		navbar,noteTable,map,figureDialog
	)
	globalEventsListener.noteSelfListener=($a,noteId)=>{
		fetchPanel.updateNote($a,Number(noteId))
	}
	globalHistory.restoreScrollPosition()
}

function writeGraphicSide(
	$graphicSide:HTMLElement,
	globalEventsListener:GlobalEventsListener, globalHistory:GlobalHistory, server:Server
): [NoteMap,FigureDialog] {
	const $mapContainer=makeDiv('map')()
	const $figureDialog=document.createElement('dialog')
	$figureDialog.classList.add('figure')
	$graphicSide.append($mapContainer,$figureDialog)

	const map=new NoteMap($mapContainer,server)
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
	const figureDialog=new FigureDialog($figureDialog)
	globalEventsListener.elementListener=($a,elementType,elementId)=>{
		if (elementType!='node' && elementType!='way' && elementType!='relation') return false
		figureDialog.close()
		downloadAndShowElement($a,server,map,elementType,elementId)
	}
	globalEventsListener.changesetListener=($a,changesetId)=>{
		figureDialog.close()
		downloadAndShowChangeset($a,server,map,changesetId)
	}
	globalEventsListener.mapListener=($a,zoom,lat,lon)=>{
		figureDialog.close()
		map.panAndZoomTo([Number(lat),Number(lon)],Number(zoom))
	}
	globalEventsListener.imageListener=($a)=>{
		figureDialog.toggle($a.href)
	}

	return [map,figureDialog]
}

function writeBelowFetchPanel(
	$scrollingPart:HTMLElement, $stickyPart:HTMLElement, $moreContainer:HTMLElement,
	storage:NoteViewerStorage, globalEventsListener:GlobalEventsListener, globalHistory:GlobalHistory, server:Server,
	map:NoteMap, figureDialog:FigureDialog
): NoteTable {
	const $filterContainer=makeDiv('panel','fetch')()
	const $notesContainer=makeDiv('notes')()
	$scrollingPart.append($filterContainer,$notesContainer,$moreContainer)
	const filterPanel=new NoteFilterPanel(server,$filterContainer)
	const $toolContainer=makeDiv('panel','command')()
	$stickyPart.append($toolContainer)

	const toolPanel=new ToolPanel(
		storage,server,globalEventsListener,
		$toolContainer,map,figureDialog
	)
	const noteTable=new NoteTable(
		$notesContainer,toolPanel,map,filterPanel.noteFilter,
		figureDialog,
		server
	)
	globalEventsListener.noteListener=($a,noteId)=>{
		noteTable.pingNoteFromLink($a,noteId)
	}
	filterPanel.subscribe(noteFilter=>noteTable.updateFilter(noteFilter))
	globalHistory.$resizeObservationTarget=$notesContainer

	return noteTable
}
