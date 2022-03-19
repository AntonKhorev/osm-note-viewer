import type {Note, NoteComment, Users} from './data'
import {NoteMap, NoteMarker} from './map'
import CommandPanel from './command'
import NoteFilter from './filter'
import {makeUserLink} from './util'

export default class NoteTable {
	private wrappedNoteMarkerClickListener: (this: NoteMarker) => void
	private wrappedNoteSectionMouseoverListener: (this: HTMLElement) => void
	private wrappedNoteSectionMouseoutListener: (this: HTMLElement) => void 
	private wrappedNoteSectionClickListener: (this: HTMLElement) => void
	private wrappedNoteCheckboxClickListener: (this: HTMLInputElement, ev: MouseEvent) => void
	private wrappedCommentRadioClickListener: (this: HTMLInputElement, ev: MouseEvent) => void
	private noteRowObserver: IntersectionObserver
	private $table: HTMLTableElement
	private currentLayerId: number | undefined
	private noteSectionLayerIdVisibility=new Map<number,boolean>()
	private $lastClickedNoteSection: HTMLTableSectionElement | undefined
	constructor($container: HTMLElement, private commandPanel: CommandPanel, private map: NoteMap, private filter: NoteFilter) {
		const that=this
		this.wrappedNoteMarkerClickListener=function(){
			that.noteMarkerClickListener(this)
		}
		this.wrappedNoteSectionMouseoverListener=function(){
			that.deactivateAllNotes()
			that.activateNote(this)
		}
		this.wrappedNoteSectionMouseoutListener=function(){
			that.deactivateNote(this)
		}
		this.wrappedNoteSectionClickListener=function(){
			that.focusMapOnNote(this)
		}
		this.wrappedNoteCheckboxClickListener=function(ev: MouseEvent){
			that.noteCheckboxClickListener(this,ev)
		}
		this.wrappedCommentRadioClickListener=function(ev: MouseEvent){
			that.commentRadioClickListener(this,ev)
		}
		this.noteRowObserver=makeNoteSectionObserver(commandPanel,map,this.noteSectionLayerIdVisibility)
		this.$table=document.createElement('table')
		$container.append(this.$table)
		{
			const $header=this.$table.createTHead()
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
		commandPanel.receiveCheckedNoteIds(getCheckedNoteIds(this.$table))
	}
	updateFilter(notes: Note[], users: Users, filter: NoteFilter): void {
		this.filter=filter
		const noteById=new Map<number,Note>()
		for (const note of notes) {
			noteById.set(note.id,note)
		}
		const uidMatcher=()=>true // TODO by looking at users
		for (const $tableSection of this.$table.querySelectorAll('tbody')) {
			const noteId=Number($tableSection.dataset.noteId)
			const note=noteById.get(noteId)
			if (note==null) continue
			if (this.filter.matchNote(note,uidMatcher)) {
				$tableSection.classList.remove('hidden')
			} else {
				$tableSection.classList.add('hidden')
			}
		}

		//$tableSection.dataset.noteId=String(note.id)
	}
	addNotes(notes: Note[], users: Users): void {
		const uidMatcher=()=>true // TODO by looking at users
		for (const note of notes) {
			const $tableSection=this.writeNote(note)
			if (!this.filter.matchNote(note,uidMatcher)) {
				$tableSection.classList.add('hidden')
			}
			let $row=$tableSection.insertRow()
			const nComments=note.comments.length
			{
				const $cell=$row.insertCell()
				$cell.classList.add('note-checkbox')
				if (nComments>1) $cell.rowSpan=nComments
				const $checkbox=document.createElement('input')
				$checkbox.type='checkbox'
				$checkbox.title=`shift+click to check/uncheck a range`
				$checkbox.addEventListener('click',this.wrappedNoteCheckboxClickListener)
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
					$radio.addEventListener('click',this.wrappedCommentRadioClickListener)
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
	private writeNote(note: Note): HTMLTableSectionElement {
		const marker=this.map.addNote(note)
		marker.on('click',this.wrappedNoteMarkerClickListener)
		const layerId=this.map.noteLayer.getLayerId(marker)
		const $tableSection=this.$table.createTBody()
		$tableSection.id=`note-${note.id}`
		$tableSection.classList.add(getStatusClass(note.status))
		$tableSection.dataset.layerId=String(layerId)
		$tableSection.dataset.noteId=String(note.id)
		$tableSection.addEventListener('mouseover',this.wrappedNoteSectionMouseoverListener)
		$tableSection.addEventListener('mouseout',this.wrappedNoteSectionMouseoutListener)
		$tableSection.addEventListener('click',this.wrappedNoteSectionClickListener)
		this.noteSectionLayerIdVisibility.set(layerId,false)
		this.noteRowObserver.observe($tableSection)
		return $tableSection
	}
	private noteMarkerClickListener(marker: NoteMarker): void {
		this.commandPanel.disableTracking()
		this.deactivateAllNotes()
		const $noteRows=document.getElementById(`note-`+marker.noteId)
		if (!$noteRows) return
		$noteRows.scrollIntoView({block:'nearest'})
		this.activateNote($noteRows)
		this.focusMapOnNote($noteRows)
	}
	private noteCheckboxClickListener($checkbox: HTMLInputElement, ev: MouseEvent): void { // need 'click' handler rather than 'change' to stop click propagation
		ev.stopPropagation()
		const $clickedNoteSection=$checkbox.closest('tbody')
		if ($clickedNoteSection) {
			if (ev.shiftKey && this.$lastClickedNoteSection) {
				for (const $section of getTableSectionRange(this.$table,this.$lastClickedNoteSection,$clickedNoteSection)) {
					const $checkbox=$section.querySelector('.note-checkbox input')
					if ($checkbox instanceof HTMLInputElement) $checkbox.checked=$checkbox.checked
				}
			}
			this.$lastClickedNoteSection=$clickedNoteSection
		}
		this.commandPanel.receiveCheckedNoteIds(getCheckedNoteIds(this.$table))
	}
	private commentRadioClickListener($radio: HTMLInputElement, ev: MouseEvent) {
		ev.stopPropagation()
		const $clickedRow=$radio.closest('tr')
		if (!$clickedRow) return
		const $time=$clickedRow.querySelector('time')
		if (!$time) return
		const $text=$clickedRow.querySelector('td.note-comment')
		this.commandPanel.receiveCheckedComment($time.dateTime,$text?.textContent??undefined)
	}
	private deactivateAllNotes(): void {
		for (const $noteRows of this.$table.querySelectorAll<HTMLElement>('tbody.active')) {
			this.deactivateNote($noteRows)
		}
	}
	private deactivateNote($noteSection: HTMLElement): void {
		this.currentLayerId=undefined
		$noteSection.classList.remove('active')
		const layerId=Number($noteSection.dataset.layerId)
		const marker=this.map.noteLayer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		marker.setZIndexOffset(0)
		marker.setOpacity(0.5)
	}
	private activateNote($noteSection: HTMLElement): void {
		const layerId=Number($noteSection.dataset.layerId)
		const marker=this.map.noteLayer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		marker.setOpacity(1)
		marker.setZIndexOffset(1000)
		$noteSection.classList.add('active')
	}
	private focusMapOnNote($noteSection: HTMLElement): void {
		const layerId=Number($noteSection.dataset.layerId)
		const marker=this.map.noteLayer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		if (layerId==this.currentLayerId) {
			const z1=this.map.getZoom()
			const z2=this.map.getMaxZoom()
			const nextZoom=Math.min(z2,z1+Math.ceil((z2-z1)/2))
			this.map.flyTo(marker.getLatLng(),nextZoom)
		} else {
			this.currentLayerId=layerId
			this.map.panTo(marker.getLatLng())
		}
	}
}

function makeNoteSectionObserver(
	commandPanel: CommandPanel, map: NoteMap,
	noteSectionLayerIdVisibility: Map<number,boolean>
): IntersectionObserver {
	let noteSectionVisibilityTimeoutId: number | undefined
	return new IntersectionObserver((entries)=>{
		for (const entry of entries) {
			if (!(entry.target instanceof HTMLElement)) continue
			const layerId=entry.target.dataset.layerId
			if (layerId==null) continue
			noteSectionLayerIdVisibility.set(Number(layerId),entry.isIntersecting)
		}
		clearTimeout(noteSectionVisibilityTimeoutId)
		noteSectionVisibilityTimeoutId=setTimeout(noteSectionVisibilityHandler)
	})
	function noteSectionVisibilityHandler(): void {
		const visibleLayerIds:number[]=[]
		for (const [layerId,visibility] of noteSectionLayerIdVisibility) {
			if (visibility) visibleLayerIds.push(layerId)
		}
		map.showNoteTrack(visibleLayerIds)
		if (commandPanel.isTracking()) map.fitNoteTrack()
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
