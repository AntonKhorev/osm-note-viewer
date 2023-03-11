import NoteMarker from './marker'

export class NoteLayer extends L.FeatureGroup {
	getLayerId(marker: L.Layer): number {
		if (marker instanceof NoteMarker) {
			return marker.noteId
		} else {
			throw new RangeError(`invalid feature in note layer`)
		}
	}
}

export class CrosshairLayer extends L.Layer {
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
