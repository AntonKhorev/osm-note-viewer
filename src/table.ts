import type {Note, NoteComment, Users} from './data'
import {NoteMap, NoteMarker} from './map'
import NoteTableCommentWriter from './table-comment'
import CommandPanel from './command-panel'
import NoteFilter from './filter'
import {toReadableDate} from './query-date'
import {makeUserLink} from './util'

export default class NoteTable {
	private wrappedNoteSectionListeners: Array<[event: string, listener: (this:HTMLTableSectionElement)=>void]>
	private wrappedNoteCheckboxClickListener: (this: HTMLInputElement, ev: MouseEvent) => void
	private wrappedAllNotesCheckboxClickListener: (this: HTMLInputElement, ev: MouseEvent) => void
	private wrappedCommentRadioClickListener: (this: HTMLInputElement, ev: MouseEvent) => void
	private wrappedNoteMarkerClickListener: (this: NoteMarker) => void
	private noteSectionVisibilityObserver: NoteSectionVisibilityObserver
	private $table = document.createElement('table')
	private $selectAllCheckbox = document.createElement('input')
	private noteSectionLayerIdVisibility=new Map<number,boolean>()
	private $lastClickedNoteSection: HTMLTableSectionElement | undefined
	private notesById = new Map<number,Note>() // in the future these might be windowed to limit the amount of stuff on one page
	private usersById = new Map<number,string>()
	private commentWriter: NoteTableCommentWriter
	constructor(
		$container: HTMLElement, 
		private commandPanel: CommandPanel, private map: NoteMap, private filter: NoteFilter, 
		private showImages: boolean
	) {
		this.commentWriter=new NoteTableCommentWriter(this.$table,this.map,$noteSection=>this.focusOnNote($noteSection))
		const that=this
		let $clickReadyNoteSection: HTMLTableSectionElement | undefined
		this.wrappedNoteSectionListeners=[
			['mouseenter',function(){
				if (this.classList.contains('active-click')) return
				that.activateNote('hover',this)
			}],
			['mouseleave',function(){
				that.deactivateNote('hover',this)
			}],
			['mousemove',function(){
				$clickReadyNoteSection=undefined // ideally should be reset by 'selectstart' event, however Chrome fires it even if no mouse drag has happened
				if (!this.classList.contains('active-click')) return
				resetActiveClickFade(this)
			}],
			['animationend',function(){
				that.deactivateNote('click',this)
			}],
			['mousedown',function(){
				$clickReadyNoteSection=this
			}],
			// ['selectstart',function(){
			// 	$clickReadyNoteSection=undefined // Chrome is too eager to fire this event, have to cancel click from 'mousemove' instead
			// }],
			['click',function(){ // need 'click' and not 'mouseup' event because elements inside may listen to click and choose to cancel it
				if ($clickReadyNoteSection==this) that.focusOnNote(this,true)
				$clickReadyNoteSection=undefined
			}]
		]
		this.wrappedNoteCheckboxClickListener=function(ev: MouseEvent){
			that.noteCheckboxClickListener(this,ev)
		}
		this.wrappedAllNotesCheckboxClickListener=function(ev: MouseEvent){
			that.allNotesCheckboxClickListener(this,ev)
		}
		this.wrappedCommentRadioClickListener=function(ev: MouseEvent){
			that.commentRadioClickListener(this,ev)
		}
		this.wrappedNoteMarkerClickListener=function(){
			that.noteMarkerClickListener(this)
		}
		this.noteSectionVisibilityObserver=new NoteSectionVisibilityObserver(commandPanel,map,this.noteSectionLayerIdVisibility)
		this.$table.classList.toggle('with-images',showImages)
		$container.append(this.$table)
		{
			const $header=this.$table.createTHead()
			const $row=$header.insertRow()
			const $checkboxCell=makeHeaderCell('')
			this.$selectAllCheckbox.type='checkbox'
			this.$selectAllCheckbox.title=`check/uncheck all`
			this.$selectAllCheckbox.addEventListener('click',this.wrappedAllNotesCheckboxClickListener)
			$checkboxCell.append(this.$selectAllCheckbox)
			$row.append(
				$checkboxCell,
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
		this.updateCheckboxDependents()
	}
	updateFilter(filter: NoteFilter): void {
		let nFetched=0
		let nVisible=0
		this.filter=filter
		const getUsername=(uid:number)=>this.usersById.get(uid)
		for (const $noteSection of this.$table.querySelectorAll('tbody')) {
			const noteId=Number($noteSection.dataset.noteId)
			const note=this.notesById.get(noteId)
			const layerId=Number($noteSection.dataset.layerId)
			if (note==null) continue
			nFetched++
			if (this.filter.matchNote(note,getUsername)) {
				nVisible++
				const marker=this.map.filteredNoteLayer.getLayer(layerId)
				if (marker) {
					this.map.filteredNoteLayer.removeLayer(marker)
					this.map.noteLayer.addLayer(marker)
				}
				$noteSection.classList.remove('hidden')
			} else {
				this.deactivateNote('click',$noteSection)
				this.deactivateNote('hover',$noteSection)
				const marker=this.map.noteLayer.getLayer(layerId)
				if (marker) {
					this.map.noteLayer.removeLayer(marker)
					this.map.filteredNoteLayer.addLayer(marker)
				}
				$noteSection.classList.add('hidden')
				const $checkbox=$noteSection.querySelector('.note-checkbox input')
				if ($checkbox instanceof HTMLInputElement) $checkbox.checked=false
			}
		}
		this.commandPanel.receiveNoteCounts(nFetched,nVisible)
		this.updateCheckboxDependents()
		this.commentWriter.handleNotesUpdate()
	}
	/**
	 * @returns number of added notes that passed through the filter
	 */
	addNotes(notes: Note[], users: Users): number {
		// remember notes and users
		for (const note of notes) {
			this.notesById.set(note.id,note)
		}
		for (const [uid,username] of Object.entries(users)) {
			this.usersById.set(Number(uid),username)
		}
		// output table
		let nUnfilteredNotes=0
		const getUsername=(uid:number)=>users[uid]
		for (const note of notes) {
			const isVisible=this.filter.matchNote(note,getUsername)
			if (isVisible) nUnfilteredNotes++
			const $noteSection=this.writeNote(note,isVisible)
			let $row=$noteSection.insertRow()
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
						$row=$noteSection.insertRow()
					}
				}{
					const $cell=$row.insertCell()
					$cell.classList.add('note-date')
					const readableDate=toReadableDate(comment.date)
					const [readableDateWithoutTime]=readableDate.split(' ',1)
					if (readableDate && readableDateWithoutTime) {
						const $time=document.createElement('time')
						$time.textContent=readableDateWithoutTime
						$time.dateTime=`${readableDate}Z`
						$time.title=`${readableDate} UTC`
						$cell.append($time)
					} else {
						const $unknownDateTime=document.createElement('span')
						$unknownDateTime.textContent=`?`
						$unknownDateTime.title=String(comment.date)
						$cell.append($unknownDateTime)
					}
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
					this.commentWriter.writeCommentText($cell,comment.text,this.showImages)
				}
				iComment++
			}
		}
		if (this.commandPanel.fitMode=='allNotes') {
			this.map.fitNotes()
		} else {
			this.map.fitNotesIfNeeded()
		}
		let nFetched=0
		let nVisible=0
		for (const $noteSection of this.$table.querySelectorAll('tbody')) {
			if (!$noteSection.dataset.noteId) continue
			nFetched++
			if (!$noteSection.classList.contains('hidden')) nVisible++
		}
		this.commandPanel.receiveNoteCounts(nFetched,nVisible)
		this.commentWriter.handleNotesUpdate()
		return nUnfilteredNotes
	}
	setShowImages(showImages: boolean) {
		this.showImages=showImages
		this.$table.classList.toggle('with-images',showImages)
		this.commentWriter.handleShowImagesUpdate(showImages)
	}
	private writeNote(note: Note, isVisible: boolean): HTMLTableSectionElement {
		const marker=new NoteMarker(note)
		const parentLayer=(isVisible ? this.map.noteLayer : this.map.filteredNoteLayer)
		marker.addTo(parentLayer)
		marker.on('click',this.wrappedNoteMarkerClickListener)
		const layerId=this.map.noteLayer.getLayerId(marker)
		const $noteSection=this.$table.createTBody()
		if (!isVisible) $noteSection.classList.add('hidden')
		$noteSection.id=`note-${note.id}`
		$noteSection.classList.add(getStatusClass(note.status))
		$noteSection.dataset.layerId=String(layerId)
		$noteSection.dataset.noteId=String(note.id)
		for (const [event,listener] of this.wrappedNoteSectionListeners) {
			$noteSection.addEventListener(event,listener)
		}
		this.noteSectionLayerIdVisibility.set(layerId,false)
		this.noteSectionVisibilityObserver.observe($noteSection)
		if (isVisible) {
			if (this.$selectAllCheckbox.checked) {
				this.$selectAllCheckbox.checked=false
				this.$selectAllCheckbox.indeterminate=true
			}
		}
		return $noteSection
	}
	private noteMarkerClickListener(marker: NoteMarker): void {
		const $noteSection=document.getElementById(`note-`+marker.noteId)
		if (!($noteSection instanceof HTMLTableSectionElement)) return
		this.focusOnNote($noteSection)
	}
	private noteCheckboxClickListener($checkbox: HTMLInputElement, ev: MouseEvent): void { // need 'click' handler rather than 'change' to stop click propagation
		ev.stopPropagation()
		const $clickedNoteSection=$checkbox.closest('tbody')
		if ($clickedNoteSection) {
			if (ev.shiftKey && this.$lastClickedNoteSection) {
				for (const $section of this.listVisibleNoteSectionsInRange(this.$lastClickedNoteSection,$clickedNoteSection)) {
					const $checkboxInRange=$section.querySelector('.note-checkbox input')
					if ($checkboxInRange instanceof HTMLInputElement) $checkboxInRange.checked=$checkbox.checked
				}
			}
			this.$lastClickedNoteSection=$clickedNoteSection
		}
		this.updateCheckboxDependents()
	}
	private allNotesCheckboxClickListener($allCheckbox: HTMLInputElement, ev: MouseEvent) {
		for (const $noteSection of this.listVisibleNoteSections()) {
			const $checkbox=$noteSection.querySelector('.note-checkbox input')
			if (!($checkbox instanceof HTMLInputElement)) continue
			$checkbox.checked=$allCheckbox.checked
		}
		this.updateCheckboxDependents()
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
	private focusOnNote($noteSection: HTMLTableSectionElement, isSectionClicked: boolean = false): void {
		this.activateNote('click',$noteSection)
		this.noteSectionVisibilityObserver.haltMapFitting() // otherwise scrollIntoView() may ruin note pan/zoom - it may cause observer to fire after exiting this function
		if (!isSectionClicked) $noteSection.scrollIntoView({block:'nearest'})
		const layerId=Number($noteSection.dataset.layerId)
		const marker=this.map.noteLayer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		const markerPt=this.map.latLngToContainerPoint(marker.getLatLng())
		const centerPt=this.map.latLngToContainerPoint(this.map.getCenter()) // instead could have gotten container width/2, height/2
		const markerIsCloseEnoughToCenter = (markerPt.x-centerPt.x)**2+(markerPt.y-centerPt.y)**2 < 100
		const z1=this.map.getZoom()
		const z2=this.map.getMaxZoom()
		if (markerIsCloseEnoughToCenter && z1<z2) {
			const nextZoom=Math.min(z2,z1+Math.ceil((z2-z1)/2))
			this.map.flyTo(marker.getLatLng(),nextZoom,{duration:.5}) // default duration is too long despite docs saying it's 0.25
		} else {
			this.map.panTo(marker.getLatLng())
		}
	}
	private deactivateNote(type: 'hover'|'click', $noteSection: HTMLTableSectionElement): void {
		$noteSection.classList.remove('active-'+type)
		if ($noteSection.classList.contains('active-hover') || $noteSection.classList.contains('active-click')) return
		const layerId=Number($noteSection.dataset.layerId)
		const marker=this.map.noteLayer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		marker.setZIndexOffset(0)
		marker.setOpacity(0.5)
	}
	private activateNote(type: 'hover'|'click', $noteSection: HTMLTableSectionElement): void {
		let alreadyActive=false
		for (const $otherNoteSection of this.$table.querySelectorAll('tbody.active-'+type)) {
			if (!($otherNoteSection instanceof HTMLTableSectionElement)) continue
			if ($otherNoteSection==$noteSection) {
				alreadyActive=true
				if (type=='click') resetActiveClickFade($noteSection)
			} else {
				this.deactivateNote(type,$otherNoteSection)
			}
		}
		if (alreadyActive) return
		const layerId=Number($noteSection.dataset.layerId)
		const marker=this.map.noteLayer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		marker.setOpacity(1)
		marker.setZIndexOffset(1000)
		$noteSection.classList.add('active-'+type)
	}
	private updateCheckboxDependents(): void {
		const checkedNotes: Note[] = []
		const checkedNoteUsers: Map<number,string> = new Map()
		let hasUnchecked=false
		for (const $noteSection of this.listVisibleNoteSections()) {
			const $checkbox=$noteSection.querySelector('.note-checkbox input')
			if (!($checkbox instanceof HTMLInputElement)) continue
			if (!$checkbox.checked) {
				hasUnchecked=true
				continue
			}
			const noteId=Number($noteSection.dataset.noteId)
			const note=this.notesById.get(noteId)
			if (!note) continue
			checkedNotes.push(note)
			for (const comment of note.comments) {
				if (comment.uid==null) continue
				const username=this.usersById.get(comment.uid)
				if (username==null) continue
				checkedNoteUsers.set(comment.uid,username)
			}
		}
		let hasChecked=checkedNotes.length>0
		this.$selectAllCheckbox.indeterminate=hasChecked && hasUnchecked
		this.$selectAllCheckbox.checked=hasChecked && !hasUnchecked
		this.commandPanel.receiveCheckedNotes(checkedNotes,checkedNoteUsers)
	}
	private listVisibleNoteSections(): NodeListOf<HTMLTableSectionElement> {
		return this.$table.querySelectorAll('tbody:not(.hidden)')
	}
	/**
	 * range including $fromSection but excluding $toSection
	 * excludes $toSection if equals to $fromSection
	 */
	private *listVisibleNoteSectionsInRange(
		$fromSection: HTMLTableSectionElement, $toSection: HTMLTableSectionElement
	): Iterable<HTMLTableSectionElement> {
		const $sections=this.listVisibleNoteSections()
		let i=0
		let $guardSection: HTMLTableSectionElement | undefined
		for (;i<$sections.length;i++) {
			const $section=$sections[i]
			if ($section==$fromSection) {
				$guardSection=$toSection
				break
			}
			if ($section==$toSection) {
				$guardSection=$fromSection
				break
			}
		}
		if (!$guardSection) return
		for (;i<$sections.length;i++) {
			const $section=$sections[i]
			if ($section!=$toSection) {
				yield $section
			}
			if ($section==$guardSection) {
				return
			}
		}
	}
}

class NoteSectionVisibilityObserver {
	private intersectionObserver: IntersectionObserver
	private visibilityTimeoutId: number | undefined
	private haltingTimeoutId: number | undefined
	private isMapFittingHalted: boolean = false
	constructor(
		commandPanel: CommandPanel, map: NoteMap,
		noteSectionLayerIdVisibility: Map<number,boolean>
	) {
		const noteSectionVisibilityHandler=()=>{
			const visibleLayerIds:number[]=[]
			for (const [layerId,visibility] of noteSectionLayerIdVisibility) {
				if (visibility) visibleLayerIds.push(layerId)
			}
			map.showNoteTrack(visibleLayerIds)
			if (!this.isMapFittingHalted && commandPanel.fitMode=='inViewNotes') map.fitNoteTrack()
		}
		this.intersectionObserver=new IntersectionObserver((entries)=>{
			for (const entry of entries) {
				if (!(entry.target instanceof HTMLElement)) continue
				const layerId=entry.target.dataset.layerId
				if (layerId==null) continue
				noteSectionLayerIdVisibility.set(Number(layerId),entry.isIntersecting)
			}
			clearTimeout(this.visibilityTimeoutId)
			this.visibilityTimeoutId=setTimeout(noteSectionVisibilityHandler)
		})
	}
	observe($noteSection: HTMLTableSectionElement): void {
		this.intersectionObserver.observe($noteSection)
	}
	haltMapFitting(): void {
		clearTimeout(this.visibilityTimeoutId)
		clearTimeout(this.haltingTimeoutId)
		this.isMapFittingHalted=true
		this.haltingTimeoutId=setTimeout(()=>{
			this.isMapFittingHalted=false
		},100)
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

function resetActiveClickFade($noteSection: HTMLTableSectionElement): void {
	const animation=getActiveClickFadeAnimation($noteSection)
	if (!animation) return
	animation.currentTime=0
}
function getActiveClickFadeAnimation($noteSection: HTMLTableSectionElement): CSSAnimation | undefined {
	if (typeof CSSAnimation == 'undefined') return // experimental technology, implemented in latest browser versions
	for (const animation of $noteSection.getAnimations()) {
		if (!(animation instanceof CSSAnimation)) continue
		if (animation.animationName=='active-click-fade') return animation
	}
}
