import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import Server from './server'
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

main()

async function main() {
	const storage=new NoteViewerStorage('osm-note-viewer-')
	const db=await NoteViewerDB.open()
	const server=new Server(`https://api.openstreetmap.org/`)
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

	const globalHistory=new GlobalHistory($scrollingPart,$notesContainer)
	const map=new NoteMap($mapContainer)
	map.onMoveEnd(()=>{
		globalHistory.setMapHash(`${map.zoom}/${map.lat}/${map.lon}`)
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

	const navbar=new Navbar(storage,$navbarContainer,map)
	const filterPanel=new NoteFilterPanel($filterContainer)
	const toolPanel=new ToolPanel(storage,globalEventsListener,$toolContainer,map,figureDialog)
	const noteTable=new NoteTable(
		$notesContainer,toolPanel,map,filterPanel.noteFilter,
		figureDialog,
		server
	)
	globalEventsListener.noteListener=($a,noteId)=>{
		noteTable.pingNoteFromLink($a,noteId)
	}
	const fetchPanel=new NoteFetchPanel(
		storage,db,server,
		globalEventsListener,globalHistory,
		$fetchContainer,$moreContainer,
		navbar,filterPanel,
		noteTable,map,figureDialog
	)
	globalEventsListener.noteSelfListener=($a,noteId)=>{
		fetchPanel.updateNote($a,Number(noteId))
	}
	globalHistory.restoreScrollPosition()
}
