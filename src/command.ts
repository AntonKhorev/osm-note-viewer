import {NoteMap} from './map'
import {makeLink} from './util'

export default class CommandPanel {
	private $trackCheckbox: HTMLInputElement
	private $loadNotesButton: HTMLButtonElement
	private $overpassButtons: HTMLButtonElement[] = []
	private checkedNoteIds: number[] = []
	private checkedCommentTime?: string
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
					const success=await openRcUrl($loadNotesButton,rcUrl)
					if (!success) break
				}
			})
			const $loadMapButton=document.createElement('button')
			$loadMapButton.textContent=`Load map area`
			$loadMapButton.addEventListener('click',()=>{
				const bounds=map.getBounds()
				const rcUrl=`http://127.0.0.1:8111/load_and_zoom`+
					`?left=`+encodeURIComponent(bounds.getWest())+
					`&right=`+encodeURIComponent(bounds.getEast())+
					`&top=`+encodeURIComponent(bounds.getNorth())+
					`&bottom=`+encodeURIComponent(bounds.getSouth())
				openRcUrl($loadMapButton,rcUrl)
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
			const clickListener=(withRelations: boolean, onlyAround: boolean)=>{
				if (this.checkedCommentTime==null) return
				const center=map.getCenter()
				const bounds=map.getBounds()
				let query=''
				query+=`[date:"${this.checkedCommentTime}"]\n`
				query+=`[bbox:${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}]\n`
				// query+=`[bbox:${bounds.toBBoxString()}];\n` // nope, different format
				query+=`;\n`
				if (withRelations) {
					query+=`nwr`
				} else {
					query+=`nw`
				}
				if (onlyAround) {
					const radius=10
					query+=`(around:${radius},${center.lat},${center.lng})`
				}
				query+=`;\n`
				query+=`out meta geom;`
				const location=`${center.lat};${center.lng};${map.getZoom()}`
				const url=`https://overpass-turbo.eu/?C=${encodeURIComponent(location)}&Q=${encodeURIComponent(query)}`
				open(url,'overpass-turbo')
			}
			const $div=document.createElement('div')
			{
				const $button=document.createElement('button')
				$button.disabled=true
				$button.textContent=`map area without relations`
				$button.addEventListener('click',()=>clickListener(false,false))
				this.$overpassButtons.push($button)
			}{
				const $button=document.createElement('button')
				$button.disabled=true
				$button.textContent=`map area with relations`
				$button.title=`may fetch large unwanted relations like routes`
				$button.addEventListener('click',()=>clickListener(true,false))
				this.$overpassButtons.push($button)
			}{
				const $button=document.createElement('button')
				$button.disabled=true
				$button.textContent=`around map center`
				$button.addEventListener('click',()=>clickListener(false,true))
				this.$overpassButtons.push($button)
			}
			$div.append(
				makeLink(`Overpass turbo`,'https://wiki.openstreetmap.org/wiki/Overpass_turbo'),
				`: load @ comment time:`
			)
			for (const $button of this.$overpassButtons) {
				$div.append(` `,$button)
			}
			$container.append($div)
		}{
			const $div=document.createElement('div')
			const $yandexPanoramasButton=document.createElement('button')
			$yandexPanoramasButton.textContent=`Open map center`
			$yandexPanoramasButton.addEventListener('click',()=>{
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
	receiveCheckedCommentTime(checkedCommentTime?: string): void {
		this.checkedCommentTime=checkedCommentTime
		for (const $button of this.$overpassButtons) {
			$button.disabled=checkedCommentTime==null
		}
	}
	isTracking(): boolean {
		return this.$trackCheckbox.checked
	}
	disableTracking(): void {
		this.$trackCheckbox.checked=false
	}
}

async function openRcUrl($button: HTMLButtonElement, rcUrl: string): Promise<boolean> {
	try {
		const response=await fetch(rcUrl)
		if (response.ok) {
			clearError()
			return true
		}
	} catch {}
	setError()
	return false
	function setError() {
		$button.classList.add('error')
		$button.title='Remote control command failed. Make sure you have an editor open and remote control enabled.'
	}
	function clearError() {
		$button.classList.remove('error')
		$button.title=''
	}
}
