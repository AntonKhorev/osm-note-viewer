import type {Note, NoteComment, Users} from './data'
import {NoteMap, NoteMarker} from './map'
import {makeUserLink} from './util'

export default function writeNotesTableAndMap(
	$container: HTMLElement, map: NoteMap,
	notes: Note[], users: Users
): void {
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
			if (nComments>1) $cell.rowSpan=nComments
			const $checkbox=document.createElement('input')
			$checkbox.type='checkbox'
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
	function makeHeaderCell(text: string): HTMLTableCellElement {
		const $cell=document.createElement('th')
		$cell.textContent=text
		return $cell
	}
	function writeNote(note: Note): HTMLTableSectionElement {
		const marker=map.addNote(note)
		marker.on('click',markerClickListener)
		const layerId=map.noteLayer.getLayerId(marker)
		const $tableSection=$table.createTBody()
		$tableSection.id=`note-${note.id}`
		$tableSection.classList.add(getStatusClass(note.status))
		$tableSection.dataset.layerId=String(layerId)
		$tableSection.addEventListener('mouseover',noteMouseoverListener)
		$tableSection.addEventListener('mouseout',noteMouseoutListener)
		$tableSection.addEventListener('click',noteClickListener)
		noteSectionLayerIdVisibility.set(layerId,false)
		noteRowObserver.observe($tableSection)
		return $tableSection
	}
	function deactivateAllNotes(): void {
		for (const $noteRows of $table.querySelectorAll<HTMLElement>('tbody.active')) {
			deactivateNote($noteRows)
		}
	}
	function deactivateNote($noteRows: HTMLElement): void {
		currentLayerId=undefined
		$noteRows.classList.remove('active')
		const layerId=Number($noteRows.dataset.layerId)
		const marker=map.noteLayer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		marker.setZIndexOffset(0)
		marker.setOpacity(0.5)
	}
	function activateNote($noteRows: HTMLElement): void {
		const layerId=Number($noteRows.dataset.layerId)
		const marker=map.noteLayer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		marker.setOpacity(1)
		marker.setZIndexOffset(1000)
		$noteRows.classList.add('active')
	}
	function markerClickListener(this: NoteMarker): void {
		deactivateAllNotes()
		const $noteRows=document.getElementById(`note-`+this.noteId)
		if (!$noteRows) return
		$noteRows.scrollIntoView()
		activateNote($noteRows)
	}
	function noteMouseoverListener(this: HTMLElement): void {
		deactivateAllNotes()
		activateNote(this)
	}
	function noteMouseoutListener(this: HTMLElement): void {
		deactivateNote(this)
	}
	function noteClickListener(this: HTMLElement): void {
		const layerId=Number(this.dataset.layerId)
		const marker=map.noteLayer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		if (layerId==currentLayerId) {
			const nextZoom=Math.min(map.getZoom()+1,map.getMaxZoom())
			map.flyTo(marker.getLatLng(),nextZoom)
		} else {
			currentLayerId=layerId
			map.panTo(marker.getLatLng())
		}
	}
	function noteSectionVisibilityHandler(): void {
		const visibleLayerIds:number[]=[]
		for (const [layerId,visibility] of noteSectionLayerIdVisibility) {
			if (visibility) visibleLayerIds.push(layerId)
		}
		map.showNoteTrack(visibleLayerIds)
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
