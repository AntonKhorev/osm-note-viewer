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
	}
	clearNotes(): void {
		this.noteLayer.clearLayers()
	}
	fitNotes(): void {
		this.fitBounds(this.noteLayer.getBounds())
	}
	addNote(note: Note): NoteMarker {
		return new NoteMarker(note).addTo(this.noteLayer)
	}
}
