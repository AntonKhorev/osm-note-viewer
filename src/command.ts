import {NoteMap} from './map'
import {makeLink} from './util'

export default class CommandPanel {
	private $trackCheckbox: HTMLInputElement
	private $loadNotesButton: HTMLButtonElement
	private checkedNoteIds: number[] = []
	constructor($container: HTMLElement, map: NoteMap) {
		{
			const $div=document.createElement('div')
			const $label=document.createElement('label')
			const $trackCheckbox=document.createElement('input')
			$trackCheckbox.type='checkbox'
			$trackCheckbox.addEventListener('change',()=>{
				if ($trackCheckbox.checked) map.fitNoteTrack()
			})
			$label.append($trackCheckbox,` track visible notes on the map`)
			$div.append($label)
			$container.append($div)
			this.$trackCheckbox=$trackCheckbox
		}{
			const $div=document.createElement('div')
			const $loadNotesButton=document.createElement('button')
			$loadNotesButton.disabled=true
			$loadNotesButton.textContent=`Load selected notes`
			$loadNotesButton.addEventListener('click',async()=>{
				for (const noteId of this.checkedNoteIds) {
					const noteUrl=`https://www.openstreetmap.org/note/`+encodeURIComponent(noteId)
					const rcUrl=`http://127.0.0.1:8111/import?url=`+encodeURIComponent(noteUrl)
					fetch(rcUrl)
				}
			})
			const $loadMapButton=document.createElement('button')
			$loadMapButton.textContent=`Load map area`
			$loadMapButton.addEventListener('click',async()=>{
				const bounds=map.getBounds()
				const rcUrl=`http://127.0.0.1:8111/load_and_zoom`+
					`?left=`+encodeURIComponent(bounds.getWest())+
					`&right=`+encodeURIComponent(bounds.getEast())+
					`&top=`+encodeURIComponent(bounds.getNorth())+
					`&bottom=`+encodeURIComponent(bounds.getSouth())
				fetch(rcUrl)
			})
			$div.append(
				makeLink(`RC`,'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl',`JOSM (or another editor) Remote Control`),
				`: `,
				$loadNotesButton,
				` `,
				$loadMapButton
			)
			$container.append($div)
			this.$loadNotesButton=$loadNotesButton
		}{
			const $div=document.createElement('div')
			const $yandexPanoramasButton=document.createElement('button')
			$yandexPanoramasButton.textContent=`Open map center`
			$yandexPanoramasButton.addEventListener('click',async()=>{
				const center=map.getCenter()
				const coords=center.lng+','+center.lat
				const url=`https://yandex.ru/maps/2/saint-petersburg/`+
					`?ll=`+encodeURIComponent(coords)+ // required if 'z' argument is present
					`&panorama%5Bpoint%5D=`+encodeURIComponent(coords)+
					`&z=`+encodeURIComponent(map.getZoom())
				open(url,'yandex')
			})
			$div.append(
				makeLink(`Y.Panoramas`,'https://wiki.openstreetmap.org/wiki/RU:%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81.%D0%9F%D0%B0%D0%BD%D0%BE%D1%80%D0%B0%D0%BC%D1%8B',`Yandex.Panoramas (Яндекс.Панорамы)`),
				`: `,
				$yandexPanoramasButton
			)
			$container.append($div)
		}
	}
	receiveCheckedNoteIds(checkedNoteIds: number[]): void {
		this.checkedNoteIds=checkedNoteIds
		this.$loadNotesButton.disabled=checkedNoteIds.length<=0
	}
	isTracking(): boolean {
		return this.$trackCheckbox.checked
	}
	disableTracking(): void {
		this.$trackCheckbox.checked=false
	}
}
