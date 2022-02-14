import type {Note} from './data'

export class NoteMarker extends L.Marker {
	noteId: number
	constructor(note: Note) {
		super([note.lat,note.lon],{
			alt: `note`,
			opacity: 0.5
		})
		this.noteId=note.id
	}
}

export class NoteMap extends L.Map {
	noteLayer: L.FeatureGroup
	trackLayer: L.FeatureGroup
	constructor($container: HTMLElement) {
		super($container)
		this.addLayer(L.tileLayer(
			'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
			{
				attribution: "© <a href=https://www.openstreetmap.org/copyright>OpenStreetMap contributors</a>",
				maxZoom: 19
			}
		)).fitWorld()
		this.noteLayer=L.featureGroup().addTo(this)
		this.trackLayer=L.featureGroup().addTo(this)
	}
	clearNotes(): void {
		this.noteLayer.clearLayers()
		this.trackLayer.clearLayers()
	}
	fitNotes(): void {
		this.fitBounds(this.noteLayer.getBounds())
	}
	addNote(note: Note): NoteMarker {
		return new NoteMarker(note).addTo(this.noteLayer)
	}
	showNoteTrack(layerIds: number[]): void {
		this.trackLayer.clearLayers()
		const polylineCoords: L.LatLng[] = []
		for (const layerId of layerIds) {
			const marker=this.noteLayer.getLayer(layerId)
			if (!(marker instanceof L.Marker)) continue
			const coords=marker.getLatLng()
			polylineCoords.push(coords)
			L.circleMarker(coords).addTo(this.trackLayer)
		}
		L.polyline(polylineCoords).addTo(this.trackLayer)
	}
}
