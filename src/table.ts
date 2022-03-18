import type {Note, NoteComment, Users} from './data'
import {NoteMap, NoteMarker} from './map'
import CommandPanel from './command'
import {makeUserLink} from './util'

export default function writeNotesTableHeaderAndGetNoteAdder(
	$container: HTMLElement, commandPanel: CommandPanel, map: NoteMap
): (notes: Note[], users: Users) => void {
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
	let $lastClickedNoteSection: HTMLTableSectionElement | undefined
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
			makeHeaderCell('?',`Action performed along with adding the comment. Also a radio button. Click to select comment for Overpass turbo commands.`),
			makeHeaderCell('comment')
		)
	}
	function makeHeaderCell(text: string, title?: string): HTMLTableCellElement {
		const $cell=document.createElement('th')
		$cell.textContent=text
		if (title) $cell.title=title
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
		commandPanel.disableTracking()
		deactivateAllNotes()
		const $noteRows=document.getElementById(`note-`+this.noteId)
		if (!$noteRows) return
		$noteRows.scrollIntoView({block:'nearest'})
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
		if (commandPanel.isTracking()) map.fitNoteTrack()
	}
	function noteCheckboxClickListener(this: HTMLInputElement, ev: MouseEvent): void { // need 'click' handler rather than 'change' to stop click propagation
		ev.stopPropagation()
		const $clickedNoteSection=this.closest('tbody')
		if ($clickedNoteSection) {
			if (ev.shiftKey && $lastClickedNoteSection) {
				for (const $section of getTableSectionRange($table,$lastClickedNoteSection,$clickedNoteSection)) {
					const $checkbox=$section.querySelector('.note-checkbox input')
					if ($checkbox instanceof HTMLInputElement) $checkbox.checked=this.checked
				}
			}
			$lastClickedNoteSection=$clickedNoteSection
		}
		commandPanel.receiveCheckedNoteIds(getCheckedNoteIds($table))
	}
	function commentRadioClickListener(this: HTMLInputElement, ev: MouseEvent) {
		ev.stopPropagation()
		const $clickedRow=this.closest('tr')
		if (!$clickedRow) return
		const $time=$clickedRow.querySelector('time')
		if (!$time) return
		const $text=$clickedRow.querySelector('td.note-comment')
		commandPanel.receiveCheckedComment($time.dateTime,$text?.textContent??undefined)
	}
	commandPanel.receiveCheckedNoteIds(getCheckedNoteIds($table))
	return (notes,users)=>{
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
				$checkbox.title=`shift+click to check/uncheck a range`
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
			let iComment=0
			for (const comment of note.comments) {
				{
					if (iComment>0) {
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
					const $span=document.createElement('span')
					$span.classList.add('icon',getActionClass(comment.action))
					$span.title=comment.action
					const $radio=document.createElement('input')
					$radio.type='radio'
					$radio.name='comment'
					$radio.value=`${note.id}-${iComment}`
					$radio.addEventListener('click',commentRadioClickListener)
					$span.append($radio)
					$cell.append($span)
				}{
					const $cell=$row.insertCell()
					$cell.classList.add('note-comment')
					$cell.textContent=comment.text
				}
				iComment++
			}
		}
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

/**
 * range including $lastClickedSection but excluding $currentClickedSection
 * excludes $currentClickedSection if equals to $lastClickedSection
 */
function *getTableSectionRange(
	$table: HTMLTableElement,
	$lastClickedSection: HTMLTableSectionElement, $currentClickedSection: HTMLTableSectionElement
): Iterable<HTMLTableSectionElement> {
	const $sections=$table.tBodies
	let i=0
	let $guardSection: HTMLTableSectionElement | undefined
	for (;i<$sections.length;i++) {
		const $section=$sections[i]
		if ($section==$lastClickedSection) {
			$guardSection=$currentClickedSection
			break
		}
		if ($section==$currentClickedSection) {
			$guardSection=$lastClickedSection
			break
		}
	}
	if (!$guardSection) return
	for (;i<$sections.length;i++) {
		const $section=$sections[i]
		if ($section!=$currentClickedSection) {
			yield $section
		}
		if ($section==$guardSection) {
			return
		}
	}
}

function getCheckedNoteIds($table: HTMLTableElement): number[] {
	const checkedNoteIds: number[] = []
	const $checkedBoxes=$table.querySelectorAll('.note-checkbox :checked')
	for (const $checkbox of $checkedBoxes) {
		const $noteSection=$checkbox.closest('tbody')
		if (!$noteSection) continue
		const noteId=Number($noteSection.dataset.noteId)
		if (!Number.isInteger(noteId)) continue
		checkedNoteIds.push(noteId)
	}
	return checkedNoteIds
}
