import NoteMarker from './marker'
import type {GeometryData} from './osm'

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

export class OsmDataLayers {
	baseDataLayer=L.featureGroup()
	createdDataLayer=L.featureGroup()
	modifiedDataLayer=L.featureGroup()
	deletedDataLayer=L.featureGroup()
	addToMap(leafletMap: L.Map) {
		this.baseDataLayer.addTo(leafletMap)
		this.createdDataLayer.addTo(leafletMap)
		this.modifiedDataLayer.addTo(leafletMap)
		this.deletedDataLayer.addTo(leafletMap)
	}
	addToLayersControl(layersControl: L.Control.Layers) {
		layersControl.addOverlay(this.baseDataLayer,`Base OSM data`)
		layersControl.addOverlay(this.createdDataLayer,`Created OSM data`)
		layersControl.addOverlay(this.modifiedDataLayer,`Modidied OSM data`)
		layersControl.addOverlay(this.deletedDataLayer,`Deleted OSM data`)
	}
	clearLayers() {
		this.baseDataLayer.clearLayers()
		this.createdDataLayer.clearLayers()
		this.modifiedDataLayer.clearLayers()
		this.deletedDataLayer.clearLayers()
	}
	addGeometryAndGetBaseLayer(geometryData: GeometryData): L.Layer {
		let [baseLayer]=geometryData.baseGeometry
		if (!baseLayer) baseLayer=L.circleMarker([0,0])
		this.baseDataLayer.addLayer(baseLayer)
		if (geometryData.createdGeometry) {
			for (const layer of geometryData.createdGeometry) {
				this.createdDataLayer.addLayer(layer)
			}
		}
		if (geometryData.modifiedGeometry) {
			for (const layer of geometryData.modifiedGeometry) {
				this.modifiedDataLayer.addLayer(layer)
			}
		}
		if (geometryData.deletedGeometry) {
			for (const layer of geometryData.deletedGeometry) {
				this.deletedDataLayer.addLayer(layer)
			}
		}
		return baseLayer
	}
}
