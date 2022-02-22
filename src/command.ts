import {NoteMap} from './map'
import {makeLink} from './util'

export default class CommandPanel {
	$trackCheckbox: HTMLInputElement
	$loadNotesButton: HTMLButtonElement
	checkedNoteIds: number[] = []
	constructor($container: HTMLElement, map: NoteMap) {
		this.$trackCheckbox=document.createElement('input')
		this.$loadNotesButton=document.createElement('button')
		const $loadMapButton=document.createElement('button')
		const $yandexPanoramasButton=document.createElement('button')
		{
			const $div=document.createElement('div')
			const $label=document.createElement('label')
			this.$trackCheckbox.type='checkbox'
			$label.append(this.$trackCheckbox,` track visible notes on the map`)
			$div.append($label)
			$container.append($div)
		}{
			const $div=document.createElement('div')
			this.$loadNotesButton.disabled=true
			this.$loadNotesButton.textContent=`Load selected notes`
			$loadMapButton.textContent=`Load map area`
			$div.append(
				makeLink(`RC`,'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl',`JOSM (or another editor) Remote Control`),
				`: `,
				this.$loadNotesButton,
				` `,
				$loadMapButton
			)
			$container.append($div)
		}{
			const $div=document.createElement('div')
			$yandexPanoramasButton.textContent=`Open map center`
			$div.append(
				makeLink(`Y.Panoramas`,'https://wiki.openstreetmap.org/wiki/RU:%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81.%D0%9F%D0%B0%D0%BD%D0%BE%D1%80%D0%B0%D0%BC%D1%8B',`Yandex.Panoramas (Яндекс.Панорамы)`),
				`: `,
				$yandexPanoramasButton
			)
			$container.append($div)
		}
		this.$loadNotesButton.addEventListener('click',async()=>{
			for (const noteId of this.checkedNoteIds) {
				const noteUrl=`https://www.openstreetmap.org/note/`+encodeURIComponent(noteId)
				const rcUrl=`http://127.0.0.1:8111/import?url=`+encodeURIComponent(noteUrl)
				fetch(rcUrl)
			}
		})
		$loadMapButton.addEventListener('click',async()=>{
			const bounds=map.getBounds()
			const rcUrl=`http://127.0.0.1:8111/load_and_zoom`+
				`?left=`+encodeURIComponent(bounds.getWest())+
				`&right=`+encodeURIComponent(bounds.getEast())+
				`&top=`+encodeURIComponent(bounds.getNorth())+
				`&bottom=`+encodeURIComponent(bounds.getSouth())
			fetch(rcUrl)
		})
		$yandexPanoramasButton.addEventListener('click',async()=>{
			const center=map.getCenter()
			const coords=center.lng+','+center.lat
			const url=`https://yandex.ru/maps/2/saint-petersburg/`+
				`?ll=`+encodeURIComponent(coords)+ // required if 'z' argument is present
				`&panorama%5Bpoint%5D=`+encodeURIComponent(coords)+
				`&z=`+encodeURIComponent(map.getZoom())
			open(url,'yandex')
		})
	}
	receiveCheckedNoteIds(checkedNoteIds: number[]): void {
		this.checkedNoteIds=checkedNoteIds
		this.$loadNotesButton.disabled=checkedNoteIds.length<=0
	}
}
