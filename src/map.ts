import type {Note, NoteComment} from './data'
import {escapeXml, makeEscapeTag} from './util'

export class NoteMarker extends L.Marker {
	noteId: number
	constructor(note: Note) {
		const width=25
		const height=40
		const auraThickness=4
		const r=width/2
		const widthWithAura=width+auraThickness*2
		const heightWithAura=height+auraThickness
		const rWithAura=widthWithAura/2
		const nInnerCircles=4
		const e=makeEscapeTag(escapeXml)
		let html=``
		html+=e`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-rWithAura} ${-rWithAura} ${widthWithAura} ${heightWithAura}">`
		html+=e`<title>${note.status} note #${note.id}</title>`,
		html+=e`<path d="${computeMarkerOutlinePath(heightWithAura-.5,rWithAura-.5)}" class="aura" fill="none" />`
		html+=e`<path d="${computeMarkerOutlinePath(height,r)}" fill="${note.status=='open'?'red':'green'}" />`
		const states=[...noteCommentsToStates(note.comments)]
		html+=drawStateCircles(r,nInnerCircles,states.slice(-nInnerCircles,-1))
		html+=e`</svg>`
		const icon=L.divIcon({
			html,
			className: 'note-marker',
			iconSize: [widthWithAura,heightWithAura],
			iconAnchor: [(widthWithAura-1)/2,heightWithAura],
		})
		super([note.lat,note.lon],{icon})
		this.noteId=note.id
		function computeMarkerOutlinePath(height: number, r: number): string {
			const rp=height-r
			const y=r**2/rp
			const x=Math.sqrt(r**2-y**2)
			const xf=x.toFixed(2)
			const yf=y.toFixed(2)
			return `M0,${rp} L-${xf},${yf} A${r},${r} 0 1 1 ${xf},${yf} Z`
		}
		function drawStateCircles(r: number, nInnerCircles: number, statesToDraw: boolean[]): string {
			const dcr=(r-.5)/nInnerCircles
			let html=``
			for (let i=2;i>=0;i--) {
				if (i>=statesToDraw.length) continue
				const cr=dcr*(i+1)
				html+=e`<circle r="${cr}" fill="${color()}" stroke="white" />`
				function color(): string {
					if (i==0 && states.length<=nInnerCircles) return 'white'
					if (statesToDraw[i]) return 'red'
					return 'green'
				}
			}
			return html
		}
	}
}

export class NoteMap {
	private leafletMap: L.Map
	elementLayer: L.FeatureGroup
	noteLayer: L.FeatureGroup
	filteredNoteLayer: L.FeatureGroup
	trackLayer: L.FeatureGroup
	needToFitNotes: boolean = false
	freezeMovements: boolean = false
	private queuedPopup: [layerId: number, writer: ()=>HTMLElement] | undefined
	constructor($container: HTMLElement) {
		this.leafletMap=L.map($container,{
			worldCopyJump: true
		})
		this.leafletMap.addLayer(L.tileLayer(
			'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
			{
				attribution: "© <a href=https://www.openstreetmap.org/copyright>OpenStreetMap contributors</a>",
				maxZoom: 19
			}
		)).fitWorld()
		this.elementLayer=L.featureGroup().addTo(this.leafletMap)
		this.noteLayer=L.featureGroup().addTo(this.leafletMap)
		this.filteredNoteLayer=L.featureGroup()
		this.trackLayer=L.featureGroup().addTo(this.leafletMap)
		const crosshairLayer=new CrosshairLayer().addTo(this.leafletMap)
		const layersControl=L.control.layers()
		layersControl.addOverlay(this.elementLayer,`OSM elements`)
		layersControl.addOverlay(this.noteLayer,`Notes`)
		layersControl.addOverlay(this.filteredNoteLayer,`Filtered notes`)
		layersControl.addOverlay(this.trackLayer,`Track between notes`)
		layersControl.addOverlay(crosshairLayer,`Crosshair`)
		layersControl.addTo(this.leafletMap)
		this.onMoveEnd(()=>{
			if (!this.queuedPopup) return
			const [layerId,popupWriter]=this.queuedPopup
			this.queuedPopup=undefined
			const geometry=this.elementLayer.getLayer(layerId)
			if (geometry) {
				const popup=L.popup({autoPan:false})
					.setLatLng(this.leafletMap.getCenter()) // need to tell the popup this exact place after map stops moving, otherwise is sometimes gets opened off-screen
					.setContent(popupWriter)
					.openOn(this.leafletMap)
				geometry.bindPopup(popup)
			}
		})
	}
	invalidateSize(): void {
		this.leafletMap.invalidateSize()
	}
	clearNotes(): void {
		this.elementLayer.clearLayers()
		this.noteLayer.clearLayers()
		this.filteredNoteLayer.clearLayers()
		this.trackLayer.clearLayers()
		this.needToFitNotes=true
	}
	fitNotes(): void {
		const bounds=this.noteLayer.getBounds()
		if (!bounds.isValid()) return
		this.fitBoundsIfNotFrozen(bounds)
		this.needToFitNotes=false
	}
	fitNotesIfNeeded(): void {
		if (!this.needToFitNotes) return
		this.fitNotes()
	}
	showNoteTrack(layerIds: number[]): void {
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
		for (const layerId of layerIds) {
			const marker=this.noteLayer.getLayer(layerId)
			if (!(marker instanceof L.Marker)) continue
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
	addOsmElement(geometry: L.Layer, popupWriter: ()=>HTMLElement): void {
		// TODO zoom on second click, like with notes
		this.elementLayer.clearLayers()
		this.elementLayer.addLayer(geometry)
		const layerId=this.elementLayer.getLayerId(geometry)
		// geometry.openPopup() // can't do it here because popup will open on a wrong spot if animation is not finished
		if (this.freezeMovements) {
			const popup=L.popup({autoPan:false}).setContent(popupWriter)
			geometry.bindPopup(popup).openPopup()
			const onOpenPopup=()=>{
				const $popupContainer=popup.getElement()
				if (!$popupContainer) return
				const offsetWithTip=calculateOffsetsToFit(this.leafletMap,$popupContainer)
				if (offsetWithTip[0]||offsetWithTip[1]) {
					hidePopupTip($popupContainer)
					const offsetWithoutTip=calculateOffsetsToFit(this.leafletMap,$popupContainer)
					popup.options.offset=offsetWithoutTip
					popup.update()
				}
			}
			const onClosePopup=()=>{
				geometry.bindPopup(popup,{offset:[0,0]})
				const $popupContainer=popup.getElement()
				if (!$popupContainer) return
				restorePopupTip($popupContainer)
			}
			geometry.on('popupopen',onOpenPopup).on('popupclose',onClosePopup)
			onOpenPopup()
		} else if (geometry instanceof L.CircleMarker) {
			this.queuedPopup=[layerId,popupWriter]
			const minZoomForNode=10
			if (this.zoom<minZoomForNode) {
				this.flyToIfNotFrozen(geometry.getLatLng(),minZoomForNode,{duration:.5})
			} else {
				this.panToIfNotFrozen(geometry.getLatLng())
			}
		} else {
			const bounds=this.elementLayer.getBounds()
			if (bounds.isValid()) {
				this.queuedPopup=[layerId,popupWriter]
				this.fitBoundsIfNotFrozen(bounds)
			} else {
				geometry.bindPopup(popupWriter).openPopup()
			}
		}
	}
	fitBounds(bounds: L.LatLngBoundsExpression): void {
		this.fitBoundsIfNotFrozen(bounds)
	}
	panTo(latlng: L.LatLngExpression): void {
		this.panToIfNotFrozen(latlng)
	}
	panAndZoomTo(latlng: L.LatLngExpression, zoom: number): void {
		this.flyToIfNotFrozen(latlng,zoom,{duration:.5}) // default duration is too long despite docs saying it's 0.25
	}
	isCloseEnoughToCenter(latlng: L.LatLngExpression): boolean {
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
	onMoveEnd(fn: L.LeafletEventHandlerFn): void {
		this.leafletMap.on('moveend',fn)
	}
	private fitBoundsIfNotFrozen(bounds: L.LatLngBoundsExpression): void {
		if (this.freezeMovements) return
		this.leafletMap.fitBounds(bounds)
	}
	private panToIfNotFrozen(latlng: L.LatLngExpression): void {
		if (this.freezeMovements) return
		this.leafletMap.panTo(latlng)
	}
	private flyToIfNotFrozen(latlng: L.LatLngExpression, zoom?: number|undefined, options?: L.ZoomPanOptions|undefined): void {
		if (this.freezeMovements) return
		this.leafletMap.flyTo(latlng,zoom,options)
	}
}

class CrosshairLayer extends L.Layer {
	$overlay?: HTMLDivElement
	onAdd(map: L.Map): this {
		// https://stackoverflow.com/questions/49184531/leafletjs-how-to-make-layer-not-movable
		this.$overlay?.remove()
		this.$overlay=document.createElement('div')
		this.$overlay.classList.add('crosshair-overlay')
		this.$overlay.innerHTML=`<svg class="crosshair"><use href="#map-crosshair" /></svg>`
		map.getContainer().append(this.$overlay)
		return this
	}
	onRemove(map: L.Map): this {
		this.$overlay?.remove()
		this.$overlay=undefined
		return this
	}
}

function *noteCommentsToStates(comments: NoteComment[]): Iterable<boolean> {
	let currentState=true
	for (const comment of comments) {
		if (comment.action=='opened' || comment.action=='reopened') {
			currentState=true
		} else if (comment.action=='closed' || comment.action=='hidden') {
			currentState=false
		}
		yield currentState
	}
}

function hidePopupTip($popupContainer: HTMLElement): void {
	$popupContainer.style.marginBottom='0'
	const $tip=$popupContainer.querySelector('.leaflet-popup-tip-container')
	if ($tip instanceof HTMLElement) {
		$tip.style.display='none'
	}
}

function restorePopupTip($popupContainer: HTMLElement): void {
	$popupContainer.style.removeProperty('margin-bottom')
	const $tip=$popupContainer.querySelector('.leaflet-popup-tip-container')
	if ($tip instanceof HTMLElement) {
		$tip.style.removeProperty('display')
	}
}

// see _adjustPan() in leaflet's Popup class
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
	// copypasted from leaflet:
	if (containerPos.x + containerWidth  > size.x) { // right
		dx = containerPos.x + containerWidth - size.x;
	}
	if (containerPos.x - dx  < 0) { // left
		dx = containerPos.x ;
	}
	if (containerPos.y + containerHeight > size.y) { // bottom
		dy = containerPos.y + containerHeight - size.y ;
	}
	if (containerPos.y - dy < 0) { // top
		dy = containerPos.y;
	}
	return [-dx,-dy]
}
