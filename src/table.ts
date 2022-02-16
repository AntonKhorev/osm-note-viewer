import type {Note, NoteComment, Users} from './data'
import {NoteMap, NoteMarker} from './map'
import {makeLink,makeUserLink} from './util'

export default function writeNotesTableAndMap(
	$container: HTMLElement, $commandContainer: HTMLElement, map: NoteMap,
	notes: Note[], users: Users
): void {
	const [$trackCheckbox,$loadNotesButton,$loadMapButton,$yandexPanoramasButton]=writeCommands($commandContainer)
	const noteSectionLayerIdVisibility=new Map<number,boolean>()
	let noteSectionVisibilityTimeoutId: number | undefined
	const noteRowObserver=new IntersectionObserver((entries)=>{
		for (const entry of entries) {
			if (!(entry.target instanceof HTMLElement)) continue
			const layerId=entry.target.dataset.layerId
			if (layerId==null) continue
			noteSectionLayerIdVisibility.set(Number(layerId),entry.isIntersecting)
		}
		clearTimeout(noteSectionVisibilityTimeoutId)
		noteSectionVisibilityTimeoutId=setTimeout(noteSectionVisibilityHandler)
	})
	let currentLayerId: number | undefined
	const $table=document.createElement('table')
	$container.append($table)
	{
		const $header=$table.createTHead()
		const $row=$header.insertRow()
		$row.append(
			makeHeaderCell(''),
			makeHeaderCell('id'),
			makeHeaderCell('date'),
			makeHeaderCell('user'),
			makeHeaderCell(''),
			makeHeaderCell('comment')
		)
	}
	for (const note of notes) {
		const $tableSection=writeNote(note)
		let $row=$tableSection.insertRow()
		const nComments=note.comments.length
		{
			const $cell=$row.insertCell()
			$cell.classList.add('note-checkbox')
			if (nComments>1) $cell.rowSpan=nComments
			const $checkbox=document.createElement('input')
			$checkbox.type='checkbox'
			$checkbox.addEventListener('click',noteCheckboxClickListener)
			$cell.append($checkbox)
		}
		{
			const $cell=$row.insertCell()
			if (nComments>1) $cell.rowSpan=nComments
			const $a=document.createElement('a')
			$a.href=`https://www.openstreetmap.org/note/`+encodeURIComponent(note.id)
			$a.textContent=`${note.id}`
			$cell.append($a)
		}
		let firstCommentRow=true
		for (const comment of note.comments) {
			{
				if (firstCommentRow) {
					firstCommentRow=false
				} else {
					$row=$tableSection.insertRow()
				}
			}{
				const $cell=$row.insertCell()
				const dateString=new Date(comment.date*1000).toISOString()
				const match=dateString.match(/(\d\d\d\d-\d\d-\d\d)T(\d\d:\d\d:\d\d)/)
				if (match) {
					const [,date,time]=match
					const $dateTime=document.createElement('time')
					$dateTime.textContent=date
					$dateTime.dateTime=`${date} ${time}Z`
					$dateTime.title=`${date} ${time} UTC`
					$cell.append($dateTime)
				} else {
					const $unknownDateTime=document.createElement('span')
					$unknownDateTime.textContent=`?`
					$unknownDateTime.title=String(comment.date)
					$cell.append($unknownDateTime)
				}
			}{
			}{
				const $cell=$row.insertCell()
				$cell.classList.add('note-user')
				if (comment.uid!=null) {
					const username=users[comment.uid]
					if (username!=null) {
						$cell.append(makeUserLink(username))
					} else {
						$cell.append(`#${comment.uid}`)
					}
				}
			}{
				const $cell=$row.insertCell()
				$cell.classList.add('note-action')
				const $icon=document.createElement('span')
				$icon.title=comment.action
				$icon.classList.add('icon',getActionClass(comment.action))
				$cell.append($icon)
			}{
				const $cell=$row.insertCell()
				$cell.classList.add('note-comment')
				$cell.textContent=comment.text
			}
		}
	}
	$trackCheckbox.addEventListener('change',()=>{
		if ($trackCheckbox.checked) map.fitNoteTrack()
	})
	$loadNotesButton.addEventListener('click',async()=>{
		const $checkedBoxes=$table.querySelectorAll('.note-checkbox :checked')
		for (const $checkbox of $checkedBoxes) {
			const $noteSection=$checkbox.closest('tbody')
			if (!$noteSection) continue
			const noteId=Number($noteSection.dataset.noteId)
			if (!Number.isInteger(noteId)) continue
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
	function makeHeaderCell(text: string): HTMLTableCellElement {
		const $cell=document.createElement('th')
		$cell.textContent=text
		return $cell
	}
	function writeNote(note: Note): HTMLTableSectionElement {
		const marker=map.addNote(note)
		marker.on('click',noteMarkerClickListener)
		const layerId=map.noteLayer.getLayerId(marker)
		const $tableSection=$table.createTBody()
		$tableSection.id=`note-${note.id}`
		$tableSection.classList.add(getStatusClass(note.status))
		$tableSection.dataset.layerId=String(layerId)
		$tableSection.dataset.noteId=String(note.id)
		$tableSection.addEventListener('mouseover',noteSectionMouseoverListener)
		$tableSection.addEventListener('mouseout',noteSectionMouseoutListener)
		$tableSection.addEventListener('click',noteSectionClickListener)
		noteSectionLayerIdVisibility.set(layerId,false)
		noteRowObserver.observe($tableSection)
		return $tableSection
	}
	function deactivateAllNotes(): void {
		for (const $noteRows of $table.querySelectorAll<HTMLElement>('tbody.active')) {
			deactivateNote($noteRows)
		}
	}
	function deactivateNote($noteSection: HTMLElement): void {
		currentLayerId=undefined
		$noteSection.classList.remove('active')
		const layerId=Number($noteSection.dataset.layerId)
		const marker=map.noteLayer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		marker.setZIndexOffset(0)
		marker.setOpacity(0.5)
	}
	function activateNote($noteSection: HTMLElement): void {
		const layerId=Number($noteSection.dataset.layerId)
		const marker=map.noteLayer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		marker.setOpacity(1)
		marker.setZIndexOffset(1000)
		$noteSection.classList.add('active')
	}
	function focusMapOnNote($noteSection: HTMLElement): void {
		const layerId=Number($noteSection.dataset.layerId)
		const marker=map.noteLayer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		if (layerId==currentLayerId) {
			const z1=map.getZoom()
			const z2=map.getMaxZoom()
			const nextZoom=Math.min(z2,z1+Math.ceil((z2-z1)/2))
			map.flyTo(marker.getLatLng(),nextZoom)
		} else {
			currentLayerId=layerId
			map.panTo(marker.getLatLng())
		}
	}
	function noteMarkerClickListener(this: NoteMarker): void {
		$trackCheckbox.checked=false
		deactivateAllNotes()
		const $noteRows=document.getElementById(`note-`+this.noteId)
		if (!$noteRows) return
		$noteRows.scrollIntoView()
		activateNote($noteRows)
		focusMapOnNote($noteRows)
	}
	function noteSectionMouseoverListener(this: HTMLElement): void {
		deactivateAllNotes()
		activateNote(this)
	}
	function noteSectionMouseoutListener(this: HTMLElement): void {
		deactivateNote(this)
	}
	function noteSectionClickListener(this: HTMLElement): void {
		focusMapOnNote(this)
	}
	function noteSectionVisibilityHandler(): void {
		const visibleLayerIds:number[]=[]
		for (const [layerId,visibility] of noteSectionLayerIdVisibility) {
			if (visibility) visibleLayerIds.push(layerId)
		}
		map.showNoteTrack(visibleLayerIds)
		if ($trackCheckbox.checked) map.fitNoteTrack()
	}
	function noteCheckboxClickListener(this: HTMLInputElement, ev: Event): void { // need 'click' handler rather than 'change' to stop click propagation
		ev.stopPropagation()
		const $anyCheckedBox=$table.querySelector('.note-checkbox :checked')
		$loadNotesButton.disabled=!$anyCheckedBox
	}
}

function getStatusClass(status: Note['status']): string {
	if (status=='open') {
		return 'open'
	} else if (status=='closed' || status=='hidden') {
		return 'closed'
	} else {
		return 'other'
	}
}

function getActionClass(action: NoteComment['action']): string {
	if (action=='opened' || action=='reopened') {
		return 'open'
	} else if (action=='closed' || action=='hidden') {
		return 'closed'
	} else {
		return 'other'
	}
}

function writeCommands($container: HTMLElement): [
	$trackCheckbox: HTMLInputElement,
	$loadNotesButton: HTMLButtonElement, $loadMapButton: HTMLButtonElement, $yandexPanoramasButton: HTMLButtonElement
] {
	const $checkbox=document.createElement('input')
	const $loadNotesButton=document.createElement('button')
	const $loadMapButton=document.createElement('button')
	const $yandexPanoramasButton=document.createElement('button')
	{
		const $div=document.createElement('div')
		const $label=document.createElement('label')
		$checkbox.type='checkbox'
		$label.append($checkbox,` track visible notes on the map`)
		$div.append($label)
		$container.append($div)
	}{
		const $div=document.createElement('div')
		$loadNotesButton.disabled=true
		$loadNotesButton.textContent=`Load selected notes`
		$loadMapButton.textContent=`Load map area`
		$div.append(
			makeLink(`RC`,'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl',`JOSM (or another editor) Remote Control`),
			`: `,
			$loadNotesButton,
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
	return [$checkbox,$loadNotesButton,$loadMapButton,$yandexPanoramasButton]
}
