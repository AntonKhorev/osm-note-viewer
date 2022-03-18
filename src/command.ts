import {NoteMap} from './map'
import {makeLink} from './util'

export default class CommandPanel {
	private $trackCheckbox: HTMLInputElement
	private $loadNotesButton: HTMLButtonElement
	private $commentTimeSelect: HTMLSelectElement
	private $commentTimeInput: HTMLInputElement
	private checkedNoteIds: number[] = []
	private checkedCommentTime?: string
	private checkedCommentText?: string
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
			const $commentTimeSelectLabel=document.createElement('label')
			const $commentTimeSelect=document.createElement('select')
			$commentTimeSelect.append(
				new Option('from comment text','text'),
				new Option('of comment','comment'),
			)
			$commentTimeSelectLabel.append(`pick time `,$commentTimeSelect)
			$commentTimeSelectLabel.title=`"from comment text" looks for time inside the comment text. Useful for MAPS.ME-generated comments. Falls back to the comment time if no time detected in the text.`
			this.$commentTimeSelect=$commentTimeSelect
			const $commentTimeInputLabel=document.createElement('label')
			const $commentTimeInput=document.createElement('input')
			// $commentTimeInput.type='datetime-local'
			// $commentTimeInput.step='1'
			$commentTimeInput.type='text'
			$commentTimeInput.size=20
			// $commentTimeInput.readOnly=true
			$commentTimeInputLabel.append(`picked `,$commentTimeInput)
			$commentTimeInputLabel.title=`In whatever format Overpass understands. No standard datetime input for now because they're being difficult with UTC and 24-hour format.`
			this.$commentTimeInput=$commentTimeInput
			$commentTimeSelect.addEventListener('input',()=>this.pickCommentTime())
			$div.append(
				`Timestamp for historic queries: `,$commentTimeSelectLabel,
				` — `,$commentTimeInputLabel
			)
			$container.append($div)
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
			const $div=document.createElement('div')
			const $overpassButtons: HTMLButtonElement[] = []
			const buttonClickListener=(withRelations: boolean, onlyAround: boolean)=>{
				const time=this.$commentTimeInput.value
				if (!time) return
				const center=map.getCenter()
				const bounds=map.getBounds()
				let query=''
				query+=`[date:"${time}"]\n`
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
			{
				const $button=document.createElement('button')
				$button.disabled=true
				$button.textContent=`map area without relations`
				$button.addEventListener('click',()=>buttonClickListener(false,false))
				$overpassButtons.push($button)
			}{
				const $button=document.createElement('button')
				$button.disabled=true
				$button.textContent=`map area with relations`
				$button.title=`May fetch large unwanted relations like routes.`
				$button.addEventListener('click',()=>buttonClickListener(true,false))
				$overpassButtons.push($button)
			}{
				const $button=document.createElement('button')
				$button.disabled=true
				$button.textContent=`around map center`
				$button.addEventListener('click',()=>buttonClickListener(false,true))
				$overpassButtons.push($button)
			}
			$div.append(
				makeLink(`Overpass turbo`,'https://wiki.openstreetmap.org/wiki/Overpass_turbo'),
				`: load:`
			)
			for (const $button of $overpassButtons) {
				$div.append(` `,$button)
			}
			$container.append($div)
			this.$commentTimeInput.addEventListener('input',()=>{
				const disableButtons=this.$commentTimeInput.value==''
				for (const $button of $overpassButtons) {
					$button.disabled=disableButtons
				}
			})
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
	receiveCheckedComment(checkedCommentTime?: string, checkedCommentText?: string): void {
		this.checkedCommentTime=checkedCommentTime
		this.checkedCommentText=checkedCommentText
		this.pickCommentTime()
	}
	isTracking(): boolean {
		return this.$trackCheckbox.checked
	}
	disableTracking(): void {
		this.$trackCheckbox.checked=false
	}
	private pickCommentTime(): void {
		const setTime=(time:string):void=>{
			this.$commentTimeInput.value=time
			this.$commentTimeInput.dispatchEvent(new Event('input'))
		}
		if (this.$commentTimeSelect.value=='text' && this.checkedCommentText!=null) {
			const match=this.checkedCommentText.match(/\d\d\d\d-\d\d-\d\d[T ]\d\d:\d\d:\d\dZ/)
			if (match) {
				const [time]=match
				return setTime(time)
			}
		}
		setTime(this.checkedCommentTime??'')
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
