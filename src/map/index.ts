import type {Server} from '../net'
import NoteMarker from './marker'
import NoteMapBounds from './bounds'
import {OsmDataLayers, NoteLayer, CrosshairLayer} from './layers'
import type {GeometryData, LayerBoundOsmData} from './osm'
import {renderOsmElement, renderOsmChangeset, renderOsmChangesetAdiff} from './osm'
import {makePopupWriter} from './popup'
import {bubbleCustomEvent} from '../util/events'
import {escapeXml, makeEscapeTag} from '../util/escape'

export {NoteMarker, NoteMapBounds}

export type NoteMapFreezeMode = 'no' | 'initial' | 'full'

export default class NoteMap {
	private leafletMap: L.Map
	private dataLayers= new OsmDataLayers()
	unselectedNoteLayer: NoteLayer
	selectedNoteLayer: NoteLayer
	filteredNoteLayer: NoteLayer
	trackLayer: L.FeatureGroup
	needToFitNotes: boolean = false
	freezeMode: NoteMapFreezeMode = 'no'
	private queuedPopup: [baseLayerId: number, writer: (layer:L.Layer)=>HTMLElement] | undefined
	constructor(
		$root: HTMLElement,
		private $container: HTMLElement,
		server: Server
	) {
		const e=makeEscapeTag(escapeXml)
		this.leafletMap=L.map($container,{
			worldCopyJump: true,
			zoomControl: false
		}).addControl(L.control.zoom({
			position: 'bottomright'
		})).addControl(L.control.scale({
			position: 'bottomleft'
		})).addLayer(L.tileLayer(
			server.tile.urlTemplate,{
				attribution: e`© <a href="${server.tile.attributionUrl}">${server.tile.attributionText}</a>`,
				maxZoom: server.tile.maxZoom
			}
		)).fitWorld()
		this.dataLayers.addToMap(this.leafletMap)
		this.unselectedNoteLayer=new NoteLayer().addTo(this.leafletMap)
		this.selectedNoteLayer=new NoteLayer().addTo(this.leafletMap)
		this.filteredNoteLayer=new NoteLayer()
		this.trackLayer=L.featureGroup().addTo(this.leafletMap)
		const crosshairLayer=new CrosshairLayer().addTo(this.leafletMap)
		const layersControl=L.control.layers()
		layersControl.addOverlay(this.unselectedNoteLayer,`Unselected notes`)
		layersControl.addOverlay(this.selectedNoteLayer,`Selected notes`)
		layersControl.addOverlay(this.filteredNoteLayer,`Filtered notes`)
		layersControl.addOverlay(this.trackLayer,`Track between notes`)
		this.dataLayers.addToLayersControl(layersControl)
		layersControl.addOverlay(crosshairLayer,`Crosshair`)
		layersControl.addTo(this.leafletMap)
		this.leafletMap.on('moveend',()=>{
			const precision=this.precision
			bubbleCustomEvent($container,'osmNoteViewer:mapMoveEnd',{
				zoom: this.zoom.toFixed(0),
				lat: this.lat.toFixed(precision),
				lon: this.lon.toFixed(precision),
			})
			if (!this.queuedPopup) return
			const [baseLayerId,popupWriter]=this.queuedPopup
			this.queuedPopup=undefined
			const baseLayer=this.dataLayers.baseDataLayer.getLayer(baseLayerId)
			if (baseLayer) {
				const popup=L.popup({autoPan:false})
					.setLatLng(this.leafletMap.getCenter()) // need to tell the popup this exact place after map stops moving, otherwise is sometimes gets opened off-screen
					.setContent(popupWriter)
					.openOn(this.leafletMap)
				baseLayer.bindPopup(popup)
			}
		})
		$root.addEventListener('osmNoteViewer:mapMoveTrigger',({detail:{zoom,lat,lon}})=>{
			this.panAndZoomTo([Number(lat),Number(lon)],Number(zoom))
		})
		$root.addEventListener('osmNoteViewer:elementRender',({detail:[element,elements]})=>{
			// TODO zoom on second click, like with notes
			this.dataLayers.clearLayers()
			this.addOsmData(server,
				renderOsmElement(element,elements)
			)
		})
		$root.addEventListener('osmNoteViewer:changesetRender',({detail:changeset})=>{
			// TODO zoom on second click, like with notes
			this.dataLayers.clearLayers()
			this.addOsmData(server,
				renderOsmChangeset(changeset)
			)
		})
		$root.addEventListener('osmNoteViewer:changesetAdiffRender',({detail:[changeset,adiff]})=>{
			// TODO zoom on second click, like with notes
			this.dataLayers.clearLayers()
			this.addOsmData(server,
				renderOsmChangesetAdiff(changeset,adiff)
			)
		})
		// TODO maybe have :dataClear event
			// this.elementLayer.clearLayers()
		$root.addEventListener('osmNoteViewer:noteFocus',ev=>{
			const noteId=ev.detail
			const marker=this.getNoteMarker(noteId)
			if (!marker) return
			const z1=this.zoom
			const z2=this.maxZoom
			if (this.isCloseEnoughToCenter(marker.getLatLng()) && z1<z2) {
				const nextZoom=Math.min(z2,z1+Math.ceil((z2-z1)/2))
				this.panAndZoomTo(marker.getLatLng(),nextZoom)
			} else {
				this.panTo(marker.getLatLng())
			}
		})
	}
	hide(hidden: boolean) {
		if (hidden) {
			this.$container.style.visibility='hidden'
		} else {
			this.$container.style.removeProperty('visibility')
		}
	}
	getNoteMarker(noteId: number): NoteMarker | undefined {
		for (const layer of [this.unselectedNoteLayer,this.selectedNoteLayer,this.filteredNoteLayer]) {
			const marker=layer.getLayer(noteId)
			if (marker instanceof NoteMarker) {
				return marker
			}
		}
	}
	removeNoteMarker(noteId: number): void {
		for (const layer of [this.unselectedNoteLayer,this.selectedNoteLayer,this.filteredNoteLayer]) {
			layer.removeLayer(noteId)
		}
	}
	moveNoteMarkerToLayer(noteId: number, toLayer: NoteLayer): NoteMarker | undefined {
		for (const layer of [this.unselectedNoteLayer,this.selectedNoteLayer,this.filteredNoteLayer]) {
			const marker=layer.getLayer(noteId)
			if (marker instanceof NoteMarker) {
				layer.removeLayer(marker)
				toLayer.addLayer(marker)
				return marker
			}
		}
	}
	invalidateSize(): void {
		this.leafletMap.invalidateSize()
	}
	clearNotes(): void {
		this.dataLayers.clearLayers()
		this.unselectedNoteLayer.clearLayers()
		this.selectedNoteLayer.clearLayers()
		this.filteredNoteLayer.clearLayers()
		this.trackLayer.clearLayers()
		this.needToFitNotes=this.freezeMode=='no'
	}
	fitSelectedNotes(): void {
		const bounds=this.selectedNoteLayer.getBounds()
		if (bounds.isValid()) {
			this.fitBoundsIfNotFrozen(bounds)
		}
	}
	fitNotes(): void {
		let bounds: L.LatLngBounds | undefined
		for (const layer of [this.unselectedNoteLayer,this.selectedNoteLayer,this.filteredNoteLayer]) {
			if (!this.leafletMap.hasLayer(layer)) continue
			if (!bounds) {
				bounds=layer.getBounds()
			} else {
				bounds.extend(layer.getBounds())
			}
		}
		if (bounds && bounds.isValid()) {
			this.fitBoundsIfNotFrozen(bounds)
			this.needToFitNotes=false
		}
	}
	fitNotesIfNeeded(): void {
		if (!this.needToFitNotes) return
		this.fitNotes()
	}
	showNoteTrack(noteIds: number[]): void {
		const polylineOptions: L.PolylineOptions = {
			interactive: false,
			color: '#004', // TODO make it depend on time distance?
			weight: 1,
			className: 'note-track', // sets non-scaling stroke defined in css
		}
		const nodeOptions: L.CircleMarkerOptions = {
			...polylineOptions,
			radius: 3,
			fill: false,
		}
		this.trackLayer.clearLayers()
		const polylineCoords: L.LatLng[] = []
		for (const noteId of noteIds) {
			const marker=this.getNoteMarker(noteId)
			if (!marker) continue
			const coords=marker.getLatLng()
			polylineCoords.push(coords)
			L.circleMarker(coords,nodeOptions).addTo(this.trackLayer)
		}
		L.polyline(polylineCoords,polylineOptions).addTo(this.trackLayer)
	}
	fitNoteTrack(): void {
		const bounds=this.trackLayer.getBounds() // invalid if track is empty; track is empty when no notes are in table view
		if (bounds.isValid()) this.fitBoundsIfNotFrozen(bounds)
	}
	private addOsmData(server: Server, geometryData: GeometryData): void {
		const clear=()=>this.dataLayers.clearLayers()
		if (geometryData.extraBaseLayer) {
			this.dataLayers.baseDataLayer.addLayer(geometryData.extraBaseLayer)
		}
		let [baseLayerIfDefined,baseData]=geometryData.baseGeometry
		const baseLayer=baseLayerIfDefined??L.circleMarker([0,0])
		this.dataLayers.baseDataLayer.addLayer(baseLayer)
		const baseLayerId=this.dataLayers.baseDataLayer.getLayerId(baseLayer)
		const addLayersWithData=(group:L.FeatureGroup,layersWithData:[layer:L.Layer,data:LayerBoundOsmData][]|undefined)=>{
			if (!layersWithData) return
			for (const [layer,data] of layersWithData) {
				group.addLayer(layer)
				layer.bindPopup(makePopupWriter(server,data,clear))
			}
		}
		addLayersWithData(this.dataLayers.createdDataLayer ,geometryData.createdGeometry)
		addLayersWithData(this.dataLayers.modifiedDataLayer,geometryData.modifiedGeometry)
		addLayersWithData(this.dataLayers.deletedDataLayer ,geometryData.deletedGeometry)
		const popupWriter=makePopupWriter(server,baseData,clear)
		// geometry.openPopup() // can't do it here because popup will open on a wrong spot if animation is not finished
		if (this.freezeMode=='full') {
			const popup=L.popup({autoPan:false}).setContent(popupWriter)
			let restorePopupTipTimeoutId: number|undefined
			const onOpenPopup=()=>{
				const $popupContainer=popup.getElement()
				if (!$popupContainer) return
				if (restorePopupTipTimeoutId) {
					clearTimeout(restorePopupTipTimeoutId)
					restorePopupTipTimeoutId=undefined
					restorePopupTip($popupContainer)
				}
				const offsetWithTip=calculateOffsetsToFit(this.leafletMap,$popupContainer)
				if (offsetWithTip[0]||offsetWithTip[1]) {
					hidePopupTip($popupContainer)
					const offsetWithoutTip=calculateOffsetsToFit(this.leafletMap,$popupContainer)
					popup.options.offset=offsetWithoutTip
					popup.update()
				}
			}
			const onClosePopup=()=>{
				baseLayer.bindPopup(popup,{offset:[0,0]})
				const $popupContainer=popup.getElement()
				if (!$popupContainer) return
				const fadeoutTransitionTime=200
				restorePopupTipTimeoutId=setTimeout(()=>{
					restorePopupTipTimeoutId=undefined
					restorePopupTip($popupContainer)
				},fadeoutTransitionTime)
			}
			baseLayer.on('popupopen',onOpenPopup).on('popupclose',onClosePopup)
			baseLayer.bindPopup(popup).openPopup()
		} else if (baseLayer instanceof L.CircleMarker) {
			this.queuedPopup=[baseLayerId,popupWriter]
			const minZoomForNode=10
			if (this.zoom<minZoomForNode) {
				this.flyToIfNotFrozen(baseLayer.getLatLng(),minZoomForNode,{duration:.5})
			} else {
				this.panToIfNotFrozen(baseLayer.getLatLng())
			}
		} else {
			const bounds=this.dataLayers.baseDataLayer.getBounds()
			if (bounds.isValid()) {
				this.queuedPopup=[baseLayerId,popupWriter]
				this.fitBoundsIfNotFrozen(bounds)
			} else {
				baseLayer.bindPopup(popupWriter).openPopup()
			}
		}
	}
	fitBounds(bounds: L.LatLngBoundsExpression): void {
		this.fitBoundsIfNotFrozen(bounds)
	}
	panTo(latlng: L.LatLngExpression): void {
		this.panToIfNotFrozen(latlng)
	}
	private panAndZoomTo(latlng: L.LatLngExpression, zoom: number): void {
		this.flyToIfNotFrozen(latlng,zoom,{duration:.5}) // default duration is too long despite docs saying it's 0.25
	}
	private isCloseEnoughToCenter(latlng: L.LatLngExpression): boolean {
		const inputPt=this.leafletMap.latLngToContainerPoint(latlng)
		const centerPt=this.leafletMap.latLngToContainerPoint(this.leafletMap.getCenter()) // instead could have gotten container width/2, height/2
		return (inputPt.x-centerPt.x)**2+(inputPt.y-centerPt.y)**2 < 100
	}
	get zoom(): number {
		return this.leafletMap.getZoom()
	}
	get maxZoom(): number {
		return this.leafletMap.getMaxZoom()
	}
	get lat(): number {
		return this.leafletMap.getCenter().lat
	}
	get lon(): number {
		return this.leafletMap.getCenter().lng
	}
	get bounds(): L.LatLngBounds {
		return this.leafletMap.getBounds()
	}
	get precisionBounds(): NoteMapBounds {
		return new NoteMapBounds(this.bounds,this.precision)
	}
	private fitBoundsIfNotFrozen(bounds: L.LatLngBoundsExpression): void {
		if (this.freezeMode=='full') return
		this.leafletMap.fitBounds(bounds)
	}
	private panToIfNotFrozen(latlng: L.LatLngExpression): void {
		if (this.freezeMode=='full') return
		this.leafletMap.panTo(latlng)
	}
	private flyToIfNotFrozen(latlng: L.LatLngExpression, zoom?: number|undefined, options?: L.ZoomPanOptions|undefined): void {
		if (this.freezeMode=='full') return
		this.leafletMap.flyTo(latlng,zoom,options)
	}
	private get precision(): number {
		return Math.max(0,Math.ceil(Math.log2(this.zoom)))
	}
}

function hidePopupTip($popupContainer: HTMLElement): void {
	$popupContainer.style.marginBottom='0'
	const $tip=$popupContainer.querySelector('.leaflet-popup-tip-container')
	if ($tip instanceof HTMLElement) {
		$tip.hidden=true
	}
}

function restorePopupTip($popupContainer: HTMLElement): void {
	$popupContainer.style.removeProperty('margin-bottom')
	const $tip=$popupContainer.querySelector('.leaflet-popup-tip-container')
	if ($tip instanceof HTMLElement) {
		$tip.hidden=false
	}
}

// logic borrowed from _adjustPan() in leaflet's Popup class
function calculateOffsetsToFit(map: L.Map, $popupContainer: HTMLElement): [dx: number, dy: number] {
	const containerWidth=$popupContainer.offsetWidth
	const containerLeft=-Math.round(containerWidth/2)
	const marginBottom=parseInt(L.DomUtil.getStyle($popupContainer,'marginBottom')??'0',10) // contains tip that is better thrown away
	const containerHeight=$popupContainer.offsetHeight+marginBottom
	const containerBottom=0
	const containerAddPos=L.DomUtil.getPosition($popupContainer)
	const layerPos=new L.Point(containerLeft,-containerHeight-containerBottom)
	layerPos.x+=containerAddPos.x
	layerPos.y+=containerAddPos.y
	const containerPos=map.layerPointToContainerPoint(layerPos)
	const size=map.getSize()
	let dx=0
	let dy=0
	if (containerPos.x+containerWidth>size.x) { // right
		dx=containerPos.x+containerWidth-size.x
	}
	if (containerPos.x-dx<0) { // left
		dx=containerPos.x
	}
	if (containerPos.y+containerHeight>size.y) { // bottom
		dy=containerPos.y+containerHeight-size.y
	}
	if (containerPos.y-dy<0) { // top
		dy=containerPos.y
	}
	return [-dx,-dy]
}
