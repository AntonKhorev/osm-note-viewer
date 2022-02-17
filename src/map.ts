import type {Note, NoteComment} from './data'

export class NoteMarker extends L.Marker {
	noteId: number
	constructor(note: Note) {
		const width=25
		const height=40
		const nInnerCircles=4
		const r=width/2
		const rp=height-r
		const y=r**2/rp
		const x=Math.sqrt(r**2-y**2)
		const xf=x.toFixed(2)
		const yf=y.toFixed(2)
		const dcr=(r-.5)/nInnerCircles
		let html=``
		html+=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-r} ${-r} ${width} ${height}">`
		html+=`<path d="M0,${rp} L-${xf},${yf} A${r},${r} 0 1 1 ${xf},${yf} Z" fill="${note.status=='open'?'red':'green'}" />`
		const states=[...noteCommentsToStates(note.comments)]
		const statesToDraw=states.slice(-nInnerCircles,-1)
		for (let i=2;i>=0;i--) {
			if (i>=statesToDraw.length) continue
			const cr=dcr*(i+1)
			html+=`<circle r="${cr}" fill="${color()}" stroke="white" />`
			function color(): string {
				if (i==0 && states.length<=nInnerCircles) return 'white'
				if (statesToDraw[i]) return 'red'
				return 'green'
			}
		}
		html+=`</svg>`
		const icon=L.divIcon({
			html,
			className: '',
			iconSize: [width,height],
			iconAnchor: [(width-1)/2,height],
		})
		super([note.lat,note.lon],{
			icon,
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
		this.fitBounds(this.trackLayer.getBounds())
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
