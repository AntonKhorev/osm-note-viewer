import {Note, NoteComment, Users} from './data'
import NoteMap from './map'
import NoteMarker from './marker'
import LooseParserListener from './loose-listen'
import LooseParserPopup from './loose-popup'
import parseLoose from './loose'
import FigureDialog from './figure'
import CommentWriter, {handleShowImagesUpdate, makeDateOutput} from './comment-writer'
import ToolPanel from './tool-panel'
import NoteFilter from './filter'
import NoteSectionVisibilityObserver from './observer'
import NoteTableAndRefresherConnector from './refresher-connector'
import {toReadableDate} from './query-date'
import type Server from './server'
import fetchTableNote from './fetch-note'
import {makeDiv, makeLink, resetFadeAnimation} from './html'

export interface NoteTableUpdater {
	addNotes(notes: Iterable<Note>, users: Users): number
	replaceNote(note: Note, users: Users): void
}

export default class NoteTable implements NoteTableUpdater {
	private wrappedNoteSectionListeners: Array<[event: string, listener: (this:HTMLTableSectionElement)=>void]>
	private wrappedNoteCheckboxClickListener: (this: HTMLInputElement, ev: MouseEvent) => void
	private wrappedAllNotesCheckboxClickListener: (this: HTMLInputElement, ev: MouseEvent) => void
	private wrappedNoteMarkerClickListener: (this: NoteMarker) => void
	private noteSectionVisibilityObserver: NoteSectionVisibilityObserver
	private looseParserListener: LooseParserListener
	private $table = document.createElement('table')
	private $selectAllCheckbox = document.createElement('input')
	private $lastClickedNoteSection: HTMLTableSectionElement | undefined
	private notesById = new Map<number,Note>() // in the future these might be windowed to limit the amount of stuff on one page
	private refresherConnector: NoteTableAndRefresherConnector
	private usersById = new Map<number,string>()
	private commentWriter: CommentWriter
	private showImages: boolean = false
	onRefresherUpdate?: (note:Note,users:Users)=>Promise<void>
	constructor(
		$container: HTMLElement,
		private toolPanel: ToolPanel, private map: NoteMap, private filter: NoteFilter,
		figureDialog: FigureDialog,
		private server: Server
	) {
		this.refresherConnector=new NoteTableAndRefresherConnector(
			toolPanel,
			(id,progress)=>{
				const $refreshWaitProgress=this.getNoteSection(id)?.querySelector('td.note-link progress')
				if (!($refreshWaitProgress instanceof HTMLProgressElement)) return
				$refreshWaitProgress.value=progress
			},
			(id)=>{
				const $noteSection=this.getNoteSection(id)
				if (!$noteSection) return
				$noteSection.dataset.updated='updated'
			},
			(note,users)=>{
				this.replaceNote(note,users)
			},
			async(id)=>{
				const $a=this.getNoteSection(id)?.querySelector('td.note-link a')
				if (!($a instanceof HTMLAnchorElement)) {
					throw new Error(`note link not found during single note fetch`)
				}
				const [note,users]=await fetchTableNote(server.api,$a,Number(id))
				await this.onRefresherUpdate?.(note,users)
				return [note,users]
			}
		)
		toolPanel.onCommentsViewChange=(onlyFirst:boolean,oneLine:boolean)=>{
			this.$table.classList.toggle('only-first-comments',onlyFirst)
			this.$table.classList.toggle('one-line-comments',oneLine)
		}
		const that=this
		let $clickReadyNoteSection: HTMLTableSectionElement | undefined
		this.wrappedNoteSectionListeners=[
			['mouseenter',function(){
				that.activateNote('hover',this)
			}],
			['mouseleave',function(){
				that.deactivateNote('hover',this)
			}],
			['mousemove',function(){
				$clickReadyNoteSection=undefined // ideally should be reset by 'selectstart' event, however Chrome fires it even if no mouse drag has happened
				if (!this.classList.contains('active-click')) return
				resetFadeAnimation(this,'active-click-fade')
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
				if ($clickReadyNoteSection==this) {
					figureDialog.close()
					that.focusOnNote(this,true)
				}
				$clickReadyNoteSection=undefined
			}]
		]
		this.wrappedNoteCheckboxClickListener=function(ev: MouseEvent){
			that.noteCheckboxClickListener(this,ev)
		}
		this.wrappedAllNotesCheckboxClickListener=function(ev: MouseEvent){
			that.allNotesCheckboxClickListener(this,ev)
		}
		this.wrappedNoteMarkerClickListener=function(){
			that.noteMarkerClickListener(this)
		}
		this.noteSectionVisibilityObserver=new NoteSectionVisibilityObserver((visibleNoteIds,isMapFittingHalted)=>{
			map.showNoteTrack(visibleNoteIds)
			if (!isMapFittingHalted && toolPanel.fitMode=='inViewNotes') map.fitNoteTrack()
			this.refresherConnector.observeNotesByRefresher(
				visibleNoteIds.map(id=>this.notesById.get(id)).filter(isDefined)
			)
		})
		this.commentWriter=new CommentWriter(server)
		$container.append(this.$table)
		this.reset()
		const looseParserPopup=new LooseParserPopup(server,$container)
		this.looseParserListener=new LooseParserListener((x,y,text)=>{
			const parseResult=parseLoose(text)
			if (!parseResult) return
			looseParserPopup.open(x,y,...parseResult)
		})
	}
	reset(): void {
		this.refresherConnector.reset()
		this.notesById.clear()
		this.usersById.clear()
		this.$lastClickedNoteSection=undefined
		this.noteSectionVisibilityObserver.disconnect()
		this.$table.innerHTML=''
		this.toolPanel.receiveNoteCounts(0,0)
		this.updateCheckboxDependents()
	}
	updateFilter(filter: NoteFilter): void {
		let nFetched=0
		let nVisible=0
		this.filter=filter
		const getUsername=(uid:number)=>this.usersById.get(uid)
		for (const $noteSection of this.$table.tBodies) {
			const noteId=Number($noteSection.dataset.noteId)
			const note=this.notesById.get(noteId)
			if (note==null) continue
			nFetched++
			if (this.filter.matchNote(note,getUsername)) {
				nVisible++
				let targetLayer=this.map.unselectedNoteLayer
				const $checkbox=$noteSection.querySelector('.note-checkbox input')
				if ($checkbox instanceof HTMLInputElement && $checkbox.checked) {
					targetLayer=this.map.selectedNoteLayer
				}
				this.map.moveNoteMarkerToLayer(noteId,targetLayer)
				$noteSection.classList.remove('hidden')
			} else {
				this.deactivateNote('click',$noteSection)
				this.deactivateNote('hover',$noteSection)
				this.map.moveNoteMarkerToLayer(noteId,this.map.filteredNoteLayer)
				$noteSection.classList.add('hidden')
				this.setNoteSelection($noteSection,false)
			}
		}
		this.toolPanel.receiveNoteCounts(nFetched,nVisible)
		this.updateCheckboxDependents()
	}
	/**
	 * @returns number of added notes that passed through the filter
	 */
	addNotes(notes: Iterable<Note>, users: Users): number {
		// remember notes and users
		const noteSequence: Note[] = []
		for (const note of notes) {
			noteSequence.push(note)
			this.notesById.set(note.id,note)
		}
		for (const [uid,username] of Object.entries(users)) {
			this.usersById.set(Number(uid),username)
		}
		// output table
		if (this.$table.childElementCount==0) this.writeTableHeader()
		let nUnfilteredNotes=0
		const getUsername=(uid:number)=>users[uid]
		for (const note of noteSequence) {
			const isVisible=this.filter.matchNote(note,getUsername)
			if (isVisible) nUnfilteredNotes++
			const $noteSection=this.$table.createTBody()
			$noteSection.dataset.noteId=String(note.id)
			this.noteSectionVisibilityObserver.observe($noteSection)
			this.makeMarker(note,isVisible)
			this.writeNoteSection($noteSection,note,users,isVisible)
			this.refresherConnector.registerNote(note)
		}
		if (this.toolPanel.fitMode=='allNotes') {
			this.map.fitNotes()
		} else {
			this.map.fitNotesIfNeeded()
		}
		this.sendNoteCountsUpdate()
		return nUnfilteredNotes
	}
	replaceNote(note: Note, users: Users): void {
		const $noteSection=this.getNoteSection(note.id)
		if (!$noteSection) return
		const $checkbox=$noteSection.querySelector('.note-checkbox input')
		const wasSelected=$checkbox instanceof HTMLInputElement && $checkbox.checked
		this.map.removeNoteMarker(note.id)
		// remember note and users
		this.notesById.set(note.id,note)
		for (const [uid,username] of Object.entries(users)) {
			this.usersById.set(Number(uid),username)
		}
		// output table section
		$noteSection.innerHTML=''
		delete $noteSection.dataset.updated
		const getUsername=(uid:number)=>users[uid]
		const isVisible=this.filter.matchNote(note,getUsername)
		this.makeMarker(note,isVisible)
		this.writeNoteSection($noteSection,note,users,isVisible)
		if (isVisible) this.setNoteSelection($noteSection,wasSelected)
		this.refresherConnector.registerNote(note)
		this.sendNoteCountsUpdate() // TODO only do if visibility changed
	}
	getVisibleNoteIds(): number[] {
		const ids: number[] = []
		for (const [,id] of this.listVisibleNoteSectionsWithIds()) {
			ids.push(id)
		}
		return ids
	}
	getSelectedNoteIds(): number[] {
		const ids: number[] = []
		for (const [$noteSection,id] of this.listVisibleNoteSectionsWithIds()) {
			const $checkbox=$noteSection.querySelector('.note-checkbox input')
			if (!($checkbox instanceof HTMLInputElement)) continue
			if (!$checkbox.checked) continue
			ids.push(id)
		}
		return ids
	}
	setShowImages(showImages: boolean): void {
		this.showImages=showImages
		this.$table.classList.toggle('with-images',showImages)
		handleShowImagesUpdate(this.$table,showImages)
	}
	pingNoteFromLink($a: HTMLAnchorElement, noteId: string): void {
		const $noteSection=this.getNoteSection(noteId)
		if (!$noteSection) {
			$a.classList.add('absent')
			$a.title=`The note is not downloaded`
		} else if ($noteSection.classList.contains('hidden')) {
			$a.classList.add('absent')
			$a.title=`The note is filtered out`
		} else {
			$a.classList.remove('absent')
			$a.title=''
			this.focusOnNote($noteSection)
		}
	}
	private writeTableHeader(): void {
		const $header=this.$table.createTHead()
		const $row=$header.insertRow()
		const $checkboxCell=makeHeaderCell('')
		this.$selectAllCheckbox.type='checkbox'
		this.$selectAllCheckbox.title=`check/uncheck all`
		this.$selectAllCheckbox.addEventListener('click',this.wrappedAllNotesCheckboxClickListener)
		$checkboxCell.append(this.$selectAllCheckbox)
		const $actionCell=makeHeaderCell('?')
		$actionCell.title=`action performed along with adding the comment; number of comments`
		$actionCell.classList.add('note-action')
		$row.append(
			$checkboxCell,
			makeHeaderCell('id'),
			makeHeaderCell('date'),
			makeHeaderCell('user'),
			$actionCell,
			makeHeaderCell('comment')
		)
		function makeHeaderCell(text: string): HTMLTableCellElement {
			const $cell=document.createElement('th')
			$cell.textContent=text
			return $cell
		}
	}
	private makeMarker(note: Note, isVisible: boolean): NoteMarker {
		const marker=new NoteMarker(note)
		marker.addTo(isVisible ? this.map.unselectedNoteLayer : this.map.filteredNoteLayer)
		marker.on('click',this.wrappedNoteMarkerClickListener)
		return marker
	}
	private writeNoteSection(
		$noteSection: HTMLTableSectionElement,
		note: Note, users: Users, isVisible: boolean
	): void {
		if (!isVisible) $noteSection.classList.add('hidden')
		$noteSection.id=`note-${note.id}`
		$noteSection.classList.add(getStatusClass(note.status))
		for (const [event,listener] of this.wrappedNoteSectionListeners) {
			$noteSection.addEventListener(event,listener)
		}
		if (isVisible) {
			if (this.$selectAllCheckbox.checked) {
				this.$selectAllCheckbox.checked=false
				this.$selectAllCheckbox.indeterminate=true
			}
		}
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
		}{
			const $cell=$row.insertCell()
			$cell.classList.add('note-link')
			if (nComments>1) $cell.rowSpan=nComments
			const $a=document.createElement('a')
			$a.href=this.server.web.getUrl(`note/`+encodeURIComponent(note.id))
			$a.dataset.noteId=$a.textContent=`${note.id}`
			$a.dataset.self='yes'
			$a.classList.add('listened')
			$a.title=`click to reload the note if you know it was updated or want to check it`
			const $refreshWaitProgress=document.createElement('progress')
			$refreshWaitProgress.value=0
			$cell.append(makeDiv()($a,$refreshWaitProgress))
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
				$cell.append(makeDateOutput(toReadableDate(comment.date)))
			}{
				const $cell=$row.insertCell()
				$cell.classList.add('note-user')
				if (comment.uid!=null) {
					const username=users[comment.uid]
					if (username!=null) {
						const href=this.server.web.getUrl(`user/`+encodeURIComponent(username))
						const $a=makeLink(username,href)
						$a.classList.add('listened')
						$a.dataset.userName=username
						$a.dataset.userId=String(comment.uid)
						$cell.append($a)
					} else {
						$cell.append(`#${comment.uid}`)
					}
				}
			}{
				let svgs=`<svg class="icon-status-${getActionClass(comment.action)}">`+
					`<title>${comment.action}</title><use href="#table-note" />`+
				`</svg>`
				if (note.comments.length>1) {
					svgs+=` <svg class="icon-comments-count">`+
						`<title>number of additional comments</title><use href="#table-comments" /><text x="8" y="8">${note.comments.length-1}</text>`+
					`</svg>`
				}
				const $cell=$row.insertCell()
				$cell.classList.add('note-action')
				$cell.innerHTML=svgs
			}{
				const $cell=$row.insertCell()
				$cell.classList.add('note-comment')
				this.commentWriter.writeComment($cell,comment.text,this.showImages)
				this.looseParserListener.listen($cell)
			}
			iComment++
		}
	}
	private sendNoteCountsUpdate(): void {
		let nFetched=0
		let nVisible=0
		for (const $noteSection of this.$table.tBodies) {
			if (!$noteSection.dataset.noteId) continue
			nFetched++
			if (!$noteSection.classList.contains('hidden')) nVisible++
		}
		this.toolPanel.receiveNoteCounts(nFetched,nVisible)
	}
	private noteMarkerClickListener(marker: NoteMarker): void {
		const $noteSection=this.getNoteSection(marker.noteId)
		if ($noteSection) this.focusOnNote($noteSection)
	}
	private noteCheckboxClickListener($checkbox: HTMLInputElement, ev: MouseEvent): void { // need 'click' handler rather than 'change' to stop click propagation
		ev.stopPropagation()
		const $clickedNoteSection=$checkbox.closest('tbody')
		if ($clickedNoteSection) {
			this.setNoteSelection($clickedNoteSection,$checkbox.checked)
			if (ev.shiftKey && this.$lastClickedNoteSection) {
				for (const $inRangeNoteSection of this.listVisibleNoteSectionsInRange(this.$lastClickedNoteSection,$clickedNoteSection)) {
					this.setNoteSelection($inRangeNoteSection,$checkbox.checked)
				}
			}
			this.$lastClickedNoteSection=$clickedNoteSection
		}
		this.updateCheckboxDependents()
	}
	private allNotesCheckboxClickListener($allCheckbox: HTMLInputElement, ev: MouseEvent) {
		for (const $noteSection of this.listVisibleNoteSections()) {
			this.setNoteSelection($noteSection,$allCheckbox.checked)
		}
		this.updateCheckboxDependents()
	}
	private focusOnNote($noteSection: HTMLTableSectionElement, isSectionClicked: boolean = false): void {
		this.activateNote('click',$noteSection)
		this.noteSectionVisibilityObserver.haltMapFitting() // otherwise scrollIntoView() may ruin note pan/zoom - it may cause observer to fire after exiting this function
		if (!isSectionClicked) $noteSection.scrollIntoView({block:'nearest'})
		const noteId=Number($noteSection.dataset.noteId)
		const marker=this.map.getNoteMarker(noteId)
		if (!marker) return
		const z1=this.map.zoom
		const z2=this.map.maxZoom
		if (this.map.isCloseEnoughToCenter(marker.getLatLng()) && z1<z2) {
			const nextZoom=Math.min(z2,z1+Math.ceil((z2-z1)/2))
			this.map.panAndZoomTo(marker.getLatLng(),nextZoom)
		} else {
			this.map.panTo(marker.getLatLng())
		}
	}
	private deactivateNote(type: 'hover'|'click', $noteSection: HTMLTableSectionElement): void {
		$noteSection.classList.remove('active-'+type)
		const noteId=Number($noteSection.dataset.noteId)
		const marker=this.map.getNoteMarker(noteId)
		if (!marker) return
		marker.getElement()?.classList.remove('active-'+type)
		if ($noteSection.classList.contains('active-hover') || $noteSection.classList.contains('active-click')) return
		marker.setZIndexOffset(0)
	}
	private activateNote(type: 'hover'|'click', $noteSection: HTMLTableSectionElement): void {
		let alreadyActive=false
		for (const $otherNoteSection of this.$table.querySelectorAll('tbody.active-'+type)) {
			if (!($otherNoteSection instanceof HTMLTableSectionElement)) continue
			if ($otherNoteSection==$noteSection) {
				alreadyActive=true
				if (type=='click') resetFadeAnimation($noteSection,'active-click-fade')
			} else {
				this.deactivateNote(type,$otherNoteSection)
			}
		}
		if (alreadyActive) return
		const noteId=Number($noteSection.dataset.noteId)
		const marker=this.map.getNoteMarker(noteId)
		if (!marker) return
		marker.setZIndexOffset(1000)
		marker.getElement()?.classList.add('active-'+type)
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
		this.toolPanel.receiveSelectedNotes(checkedNotes,checkedNoteUsers)
		if (this.toolPanel.fitMode=='selectedNotes') this.map.fitSelectedNotes()
	}
	private setNoteSelection($noteSection: HTMLTableSectionElement, isSelected: boolean): void {
		const getTargetLayer=()=>{
			if ($noteSection.classList.contains('hidden')) {
				return this.map.filteredNoteLayer
			} else if (isSelected) {
				return this.map.selectedNoteLayer
			} else {
				return this.map.unselectedNoteLayer
			}
		}
		const $checkbox=$noteSection.querySelector('.note-checkbox input')
		if ($checkbox instanceof HTMLInputElement) $checkbox.checked=isSelected
		const noteId=Number($noteSection.dataset.noteId)
		const note=this.notesById.get(noteId)
		if (!note) return
		const marker=this.map.moveNoteMarkerToLayer(noteId,getTargetLayer())
		if (!marker) return
		marker.updateIcon(note,isSelected)
		const activeClasses=['hover','click'].map(type=>'active-'+type).filter(cls=>$noteSection.classList.contains(cls))
		marker.getElement()?.classList.add(...activeClasses)
	}
	private listVisibleNoteSections(): NodeListOf<HTMLTableSectionElement> {
		return this.$table.querySelectorAll('tbody:not(.hidden)')
	}
	private *listVisibleNoteSectionsWithIds(): Generator<[HTMLTableSectionElement,number]> {
		for (const $noteSection of this.listVisibleNoteSections()) {
			const idString=$noteSection.dataset.noteId
			if (!idString) continue
			yield [$noteSection,Number(idString)]
		}
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
	private getNoteSection(noteId:number|string):HTMLTableSectionElement|undefined {
		const $noteSection=document.getElementById(`note-`+noteId) // TODO look in $table
		if (!($noteSection instanceof HTMLTableSectionElement)) return
		return $noteSection
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

function isDefined<T>(argument: T | undefined): argument is T {
	return argument !== undefined
}
