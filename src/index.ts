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

main()

async function main() {
	const storage=new NoteViewerStorage('osm-note-viewer-')
	const db=await NoteViewerDB.open()
	const serverList=new ServerList([
		null,
		`https://master.apis.dev.openstreetmap.org/`,
		{
			web: [
				`https://www.openhistoricalmap.org/`,
				`https://openhistoricalmap.org/`
			],
			nominatim: `https://nominatim.openhistoricalmap.org/`,
			overpass: `https://overpass-api.openhistoricalmap.org/`,
			overpassTurbo: `https://openhistoricalmap.github.io/overpass-turbo/`,
		},
		{
			web: `https://opengeofiction.net/`,
			tiles: `https://tiles04.rent-a-planet.com/ogf-carto/{z}/{x}/{y}.png`,
			overpass: `https://overpass.ogf.rent-a-planet.com/`,
			overpassTurbo: `https://turbo.ogf.rent-a-planet.com/`
		},
		{
			web: `https://fosm.org/`,
			tiles: {
				template: `https://map.fosm.org/default/{z}/{x}/{y}.png`,
				attribution: `https://fosm.org/`,
				zoom: 18
			}
		}
	])
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

	const globalHistory=new GlobalHistory($scrollingPart,$notesContainer,serverList)
	const server=globalHistory.server
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

	const navbar=new Navbar(storage,$navbarContainer,map)
	const filterPanel=new NoteFilterPanel(server,$filterContainer)
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
	const fetchPanel=new NoteFetchPanel(
		storage,db,server,serverList,
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
