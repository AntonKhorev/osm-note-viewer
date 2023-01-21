import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import ServerList from './server-list'
import GlobalEventsListener from './events'
import GlobalHistory, {GlobalHistoryWithServer} from './history'
import Auth from './auth'
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
	// TODO don't output html before handling auth callback parameters
	const auth=new Auth()
	if (auth.checkReceivedCode()) {
		return
	}
	
	let map: NoteMap|undefined
	let figureDialog: FigureDialog|undefined
	let noteTable: NoteTable|undefined
	if (globalHistory.hasServer()) {
		[map,figureDialog]=writeGraphicSide(globalEventsListener,globalHistory)
		noteTable=writeBelowFetchPanel(
			$scrollingPart,$stickyPart,$moreContainer,
			storage,globalEventsListener,globalHistory,
			map,figureDialog
		)
	} else {
		document.body.classList.add('only-text-side')
	}
	const navbar=new Navbar(storage,$navbarContainer,map)
	const fetchPanel=new NoteFetchPanel(
		storage,db,globalEventsListener,globalHistory,auth,
		$fetchContainer,$moreContainer,
		navbar,noteTable,map,figureDialog
	)
	if (noteTable) {
		noteTable.onRefresherUpdate=async(note,users)=>{
			await fetchPanel.fetcherRun?.updateNote(note,users)
		}
	}
	if (globalHistory.hasServer()) {
		globalEventsListener.noteSelfListener=async($a,noteId)=>{
			try {
				const [note,users]=await fetchTableNote(globalHistory.server,$a,Number(noteId))
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

	const map=new NoteMap($mapContainer,globalHistory.server)
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
		downloadAndShowElement($a,globalHistory.server,map,elementType,elementId)
	}
	globalEventsListener.changesetListener=($a,changesetId)=>{
		figureDialog.close()
		downloadAndShowChangeset($a,globalHistory.server,map,changesetId)
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
	storage:NoteViewerStorage, globalEventsListener:GlobalEventsListener, globalHistory:GlobalHistoryWithServer,
	map:NoteMap, figureDialog:FigureDialog
): NoteTable {
	const $filterContainer=makeDiv('panel','fetch')()
	const $notesContainer=makeDiv('notes')()
	$scrollingPart.append($filterContainer,$notesContainer,$moreContainer)
	const filterPanel=new NoteFilterPanel(globalHistory.server,$filterContainer)
	const $toolContainer=makeDiv('panel','command')()
	$stickyPart.append($toolContainer)

	const toolPanel=new ToolPanel(
		storage,globalHistory.server,globalEventsListener,
		$toolContainer,map,figureDialog
	)
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

	return noteTable
}
