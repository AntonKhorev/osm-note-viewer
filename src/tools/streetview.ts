import {Tool, ToolElements, ToolCallbacks, makeMapIcon} from './base'
import type NoteMap from '../map'
import {makeLink} from '../html'
import {p} from '../html-shortcuts'
import {makeEscapeTag} from '../escape'

export abstract class StreetViewTool extends Tool {
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		const $viewButton=document.createElement('button')
		$viewButton.append(`Open `,makeMapIcon('center'))
		$viewButton.onclick=()=>{
			open(this.generateUrl(map),this.id)
		}
		return [$viewButton]
	}
	protected abstract generateUrl(map: NoteMap): string
}

export class YandexPanoramasTool extends StreetViewTool {
	id='yandex-panoramas'
	name=`Y.Panoramas`
	title=`Open a Yandex.Panoramas (Яндекс.Панорамы) window`
	getInfo() {return[p(
		`Open a map location in `,makeLink(`Yandex.Panoramas`,'https://wiki.openstreetmap.org/wiki/RU:%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81.%D0%9F%D0%B0%D0%BD%D0%BE%D1%80%D0%B0%D0%BC%D1%8B'),` street view. `,
		`Could be useful to find out if an object mentioned in a note existed at a certain point of time. `,
		`Yandex.Panoramas have a year selector in the upper right corner. Use it to get a photo made close to the date of interest.`
	)]}
	protected generateUrl(map: NoteMap): string {
		const e=makeEscapeTag(encodeURIComponent)
		const coords=map.lon+','+map.lat
		return e`https://yandex.ru/maps/?ll=${coords}&panorama%5Bpoint%5D=${coords}&z=${map.zoom}` // 'll' is required if 'z' argument is present
	}
}

export class MapillaryTool extends StreetViewTool {
	id='mapillary'
	name=`Mapillary`
	title=`Open a Mapillary window`
	getInfo() {return[p(
		`Open a map location in `,makeLink(`Mapillary`,'https://wiki.openstreetmap.org/wiki/Mapillary'),`. `,
		`Not yet fully implemented. The idea is to jump straight to the best available photo, but in order to do that, Mapillary API has to be queried for available photos. That's impossible to do without an API key.`
	)]}
	protected generateUrl(map: NoteMap): string {
		const e=makeEscapeTag(encodeURIComponent)
		return e`https://www.mapillary.com/app/?lat=${map.lat}&lng=${map.lon}&z=${map.zoom}&focus=photo`
	}
}
