import type {Note, Users} from '../data'
import {getNoteUpdateDate} from '../data'
import type NoteViewerStorage from '../storage'
import type NoteMap from '../map'
import {NoteMarker} from '../map'
import Expanders from './expanders'
import LooseParserListener from '../loose-listen'
import LooseParserPopup from '../loose-popup'
import parseLoose from '../loose'
import {writeHeadSectionRow, writeNoteSectionRows} from './section'
import Cursor from './cursor'
import CommentWriter, {handleShowImagesUpdate} from '../comment-writer'
import type NoteFilter from '../filter'
import NoteSectionVisibilityObserver from './observer'
import IdShortener from '../id-shortener'
import type {Server} from '../net'
import {makeElement, resetAnimation} from '../util/html'
import {bubbleCustomEvent} from '../util/events'

export interface NoteTableUpdater {
	addNotes(notes: Iterable<Note>, users: Users): number
}

export default class NoteTable implements NoteTableUpdater {
	private wrappedNoteSectionListeners: Array<[event: string, listener: (this:HTMLTableSectionElement,ev:Event)=>void]>
	private wrappedNoteCheckboxClickListener: (this: HTMLInputElement, ev: MouseEvent) => void
	private wrappedAllNotesCheckboxClickListener: (this: HTMLInputElement, ev: MouseEvent) => void
	private cursor: Cursor
	private expanders: Expanders
	private noteSectionVisibilityObserver: NoteSectionVisibilityObserver
	private looseParserListener: LooseParserListener
	private $table = makeElement('table')()()
	private $selectAllCheckbox = document.createElement('input')
	private $lastClickedNoteSection: HTMLTableSectionElement | undefined
	private notesById = new Map<number,Note>() // in the future these might be windowed to limit the amount of stuff on one page
	private usersById = new Map<number,string>()
	private commentWriter: CommentWriter
	private showImages: boolean = false
	private mapFitMode: 'allNotes' | 'selectedNotes' | 'inViewNotes' | undefined
	private markUser: string|number|undefined
	private markText: string|undefined
	constructor(
		$root: HTMLElement,
		$container: HTMLElement,
		storage: NoteViewerStorage,
		private map: NoteMap,
		private filter: NoteFilter,
		private server: Server
	) {
		this.expanders=new Expanders(storage,this.$table)
		this.$table.setAttribute('role','grid')
		const that=this
		let $clickReadyNoteSection: HTMLTableSectionElement|undefined
		this.wrappedNoteSectionListeners=[
			['mouseenter',function(){
				that.activateNote('hover',this)
			}],
			['mouseleave',function(){
				that.deactivateNote('hover',this)
			}],
			['mousemove',function(){
				$clickReadyNoteSection=undefined
				if (!this.classList.contains('active-click')) return
				resetAnimation(this,'active-click-fade')
			}],
			['animationend',function(){
				that.deactivateNote('click',this)
			}],
			['mousedown',function(){
				$clickReadyNoteSection=this
			}],
			['click',function(ev){
				if (
					that.$table.classList.contains('expanded-map-link') &&
					$clickReadyNoteSection==this &&
					!(
						ev.target instanceof HTMLElement &&
						ev.target.closest('a.listened, time.listened')
					)
				) {
					that.focusOnNote(this,true)
					ev.preventDefault()
					ev.stopPropagation()
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
		this.cursor=new Cursor(
			this.$table,
			(select)=>{
				this.$lastClickedNoteSection=undefined
				for (const [iSection,selected] of select) {
					const $section=this.$table.tBodies.item(iSection)
					if ($section) this.setNoteSelection($section,selected)
				}
				this.updateCheckboxDependentsAndSendNoteChangeEvents()
			}
		)
		$root.append(this.cursor.$helpDialog)
		this.noteSectionVisibilityObserver=new NoteSectionVisibilityObserver((visibleNoteIds,isMapFittingHalted)=>{
			map.showNoteTrack(visibleNoteIds)
			if (!isMapFittingHalted && this.mapFitMode=='inViewNotes') map.fitNoteTrack()
			bubbleCustomEvent(this.$table,'osmNoteViewer:notesInViewportChange',
				visibleNoteIds.map(id=>this.notesById.get(id)).filter(isDefined)
			)
		})
		this.commentWriter=new CommentWriter(server.web)
		$container.append(this.$table)
		this.reset()
		const looseParserPopup=new LooseParserPopup(server.web,$container)
		this.looseParserListener=new LooseParserListener((x,y,text)=>{
			const parseResult=parseLoose(text)
			if (!parseResult) return
			looseParserPopup.open(x,y,...parseResult)
		})
		$root.addEventListener('osmNoteViewer:noteLinkClick',ev=>{
			const $a=ev.target
			if (!($a instanceof HTMLAnchorElement) || !$a.dataset.noteId) return
			this.pingNoteFromLink($a,$a.dataset.noteId)
		})
		$root.addEventListener('osmNoteViewer:mapFitModeChange',ev=>{
			const mapFitMode=ev.detail
			if (mapFitMode=='allNotes') {
				this.mapFitMode=mapFitMode
				map.fitNotes()
			} else if (mapFitMode=='selectedNotes') {
				this.mapFitMode=mapFitMode
				map.fitSelectedNotes()
			} else if (mapFitMode=='inViewNotes') {
				this.mapFitMode=mapFitMode
				map.fitNoteTrack()
			} else {
				this.mapFitMode=undefined
			}
		})
		$root.addEventListener('osmNoteViewer:beforeNoteFetch',({detail:id})=>{
			const $a=this.getNoteLink(id)
			if (!($a instanceof HTMLAnchorElement)) return
			$a.classList.add('loading')
		})
		$root.addEventListener('osmNoteViewer:failedNoteFetch',({detail:[id,message]})=>{
			const $a=this.getNoteLink(id)
			if (!($a instanceof HTMLAnchorElement)) return
			$a.classList.remove('loading')
			$a.classList.add('absent')
			$a.title=`${message}, try to reload again`
		})
		$root.addEventListener('osmNoteViewer:noteFetch',({detail:[note,users,updateType]})=>{
			const $noteSection=this.getNoteSection(note.id)
			if (!$noteSection) return
			const $a=this.getNoteLink($noteSection)
			if (!$a) return
			$a.classList.remove('loading','absent')
			let oldUpdateDate=0
			const $time=$noteSection.querySelector('tr:last-of-type td.note-date time')
			if ($time instanceof HTMLTimeElement) {
				const oldUpdateDateInMs=Date.parse($time.dateTime)
				if (oldUpdateDateInMs) oldUpdateDate=oldUpdateDateInMs/1000
			}
			if (oldUpdateDate<getNoteUpdateDate(note)) {
				$noteSection.dataset.updated='updated'
			}
			if (updateType=='manual') {
				const nManualUpdates=Number($noteSection.dataset.nManualUpdates)
				if (nManualUpdates) {
					$noteSection.dataset.nManualUpdates=String(nManualUpdates+1)
				} else {
					$noteSection.dataset.nManualUpdates='1'
				}
			} else {
				delete $noteSection.dataset.nManualUpdates
			}
			setUpdateLinkTitle($noteSection,$a)
		})
		$root.addEventListener('osmNoteViewer:noteUpdatePush',({detail:[note,users]})=>{
			this.replaceNote(note,users)
		})
		$root.addEventListener('osmNoteViewer:noteRefreshWaitProgress',ev=>{
			const [id,progress]=ev.detail
			const $refreshWaitProgress=this.getNoteSection(id)?.querySelector('td.note-link progress')
			if (!($refreshWaitProgress instanceof HTMLProgressElement)) return
			$refreshWaitProgress.value=progress
		})
	}
	reset($caption?: HTMLTableCaptionElement, markUser?: string|number|undefined, markText?: string|undefined): void {
		this.markUser=markUser
		this.markText=markText
		this.notesById.clear()
		this.usersById.clear()
		this.cursor.reset(this.$table)
		this.$lastClickedNoteSection=undefined
		this.noteSectionVisibilityObserver.disconnect()
		this.$table.replaceChildren()
		if ($caption) this.$table.append($caption)
		this.updateCheckboxDependentsAndSendNoteChangeEvents()
	}
	updateFilter(filter: NoteFilter): void {
		this.filter=filter
		const getUsername=(uid:number)=>this.usersById.get(uid)
		for (const $noteSection of this.$table.tBodies) {
			const noteId=Number($noteSection.dataset.noteId)
			const note=this.notesById.get(noteId)
			if (note==null) continue
			if (this.filter.matchNote(note,getUsername)) {
				let targetLayer=this.map.unselectedNoteLayer
				if (isSelectedNoteSection($noteSection)) {
					targetLayer=this.map.selectedNoteLayer
				}
				this.map.moveNoteMarkerToLayer(noteId,targetLayer)
				$noteSection.hidden=false
			} else {
				this.deactivateNote('click',$noteSection)
				this.deactivateNote('hover',$noteSection)
				this.map.moveNoteMarkerToLayer(noteId,this.map.filteredNoteLayer)
				$noteSection.hidden=true
				this.setNoteSelection($noteSection,false)
			}
		}
		this.updateCheckboxDependentsAndSendNoteChangeEvents()
		this.cursor.updateTabIndex()
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
		let nUnfilteredNotes=0
		const getUsername=(uid:number)=>users[uid]
		for (const note of noteSequence) {
			if (this.$table.rows.length==0) {
				const $header=this.writeHeadSection()
				this.noteSectionVisibilityObserver.stickyHeight=$header.offsetHeight
				document.documentElement.style.setProperty('--table-header-height',$header.offsetHeight+'px')
			}
			const isVisible=this.filter.matchNote(note,getUsername)
			if (isVisible) nUnfilteredNotes++
			const $noteSection=this.$table.createTBody()
			$noteSection.dataset.noteId=String(note.id)
			this.noteSectionVisibilityObserver.observe($noteSection)
			this.makeMarker(note,isVisible)
			const $checkbox=document.createElement('input')
			$checkbox.type='checkbox'
			// $checkbox.title=`shift+click to select/unselect a range`
			$checkbox.addEventListener('click',this.wrappedNoteCheckboxClickListener)
			this.writeNoteSection($noteSection,$checkbox,note,users,isVisible)
			bubbleCustomEvent(this.$table,'osmNoteViewer:noteRender',note)
		}
		this.updateShortenedNoteIds()
		if (this.mapFitMode=='allNotes') {
			this.map.fitNotes()
		} else {
			this.map.fitNotesIfNeeded()
		}
		this.sendNoteCounts()
		return nUnfilteredNotes
	}
	private replaceNote(note: Note, users: Users): void {
		const $noteSection=this.getNoteSection(note.id)
		if (!$noteSection) throw new Error(`note section not found during note replace`)
		const $checkbox=getNoteSectionCheckbox($noteSection)
		if (!$checkbox) throw new Error(`note checkbox not found during note replace`)
		const $a=$noteSection.querySelector('td.note-link a')
		if (!($a instanceof HTMLAnchorElement)) throw new Error(`note link not found during note replace`)
		const isNoteLinkFocused=document.activeElement==$a
		this.map.removeNoteMarker(note.id)
		// remember note and users
		this.notesById.set(note.id,note)
		for (const [uid,username] of Object.entries(users)) {
			this.usersById.set(Number(uid),username)
		}
		// clean up table section
		$noteSection.innerHTML=''
		delete $noteSection.dataset.updated
		$noteSection.className=''
		// output table section
		const getUsername=(uid:number)=>users[uid]
		const isVisible=this.filter.matchNote(note,getUsername)
		this.makeMarker(note,isVisible)
		this.writeNoteSection($noteSection,$checkbox,note,users,isVisible)
		const $a2=this.getNoteLink($noteSection)
		if (!($a2 instanceof HTMLAnchorElement)) throw new Error(`note link not found after note replace`)
		setUpdateLinkTitle($noteSection,$a2)
		if (isNoteLinkFocused) $a2.focus()
		this.updateShortenedNoteIds() // id doesn't change but it's overwritten and not shortened by default
		this.updateCheckboxDependentsAndSendNoteChangeEvents()
		bubbleCustomEvent(this.$table,'osmNoteViewer:noteRender',note)
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
			if (!isSelectedNoteSection($noteSection)) continue
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
		} else if ($noteSection.hidden) {
			$a.classList.add('absent')
			$a.title=`The note is filtered out`
		} else {
			$a.classList.remove('absent')
			$a.title=''
			this.focusOnNote($noteSection)
		}
	}
	focus() {
		this.cursor.focus()
	}
	private writeHeadSection(): HTMLTableSectionElement {
		const $headSection=this.$table.createTHead()
		this.$selectAllCheckbox.type='checkbox'
		this.$selectAllCheckbox.title=`select all notes`
		this.$selectAllCheckbox.addEventListener('click',this.wrappedAllNotesCheckboxClickListener)
		writeHeadSectionRow(
			$headSection,
			this.$selectAllCheckbox,
			(key,clickListener)=>this.expanders.makeButton(key,clickListener),
			()=>this.$table.tBodies,
			()=>this.cursor.updateTabIndex()
		)
		return $headSection
	}
	private makeMarker(note: Note, isVisible: boolean): NoteMarker {
		const marker=new NoteMarker(this.server.web,note)
		marker.addTo(isVisible ? this.map.unselectedNoteLayer : this.map.filteredNoteLayer)
		return marker
	}
	private writeNoteSection(
		$noteSection: HTMLTableSectionElement,
		$checkbox: HTMLInputElement,
		note: Note, users: Users,
		isVisible: boolean
	): void {
		if (!isVisible) $noteSection.hidden=true
		$noteSection.id=`note-${note.id}`
		$noteSection.classList.add(`status-${note.status}`)
		for (const [event,listener] of this.wrappedNoteSectionListeners) {
			$noteSection.addEventListener(event,listener)
		}
		if (isVisible && !$checkbox.checked) {
			if (this.$selectAllCheckbox.checked) {
				this.$selectAllCheckbox.checked=false
				this.$selectAllCheckbox.indeterminate=true
			}
		}
		$checkbox.setAttribute('aria-label',`${note.status} note at latitude ${note.lat}, longitude ${note.lon}`)
		const $commentCells=writeNoteSectionRows(
			this.server.web,this.commentWriter,
			$noteSection,$checkbox,
			note,users,
			!this.$table.classList.contains('expanded-comments'),
			this.showImages,
			this.markUser,this.markText,
			()=>this.focusOnNote($noteSection,true),
			()=>this.cursor.updateTabIndex()
		)
		for (const $commentCell of $commentCells) {
			this.looseParserListener.listen($commentCell)
		}
		this.cursor.updateTabIndex()
	}
	private updateShortenedNoteIds() {
		const shortener=new IdShortener
		for (const $noteSection of this.$table.tBodies) {
			const $a=this.getNoteLink($noteSection)
			if (!$a) continue
			const id=$a.dataset.noteId
			if (id==null) continue
			if (shortener.scan(id)) break
		}
		for (const $noteSection of this.$table.tBodies) {
			const $a=this.getNoteLink($noteSection)
			if (!$a) continue
			const id=$a.dataset.noteId
			if (id==null) continue
			const [constantPart,variablePart]=shortener.split(id)
			$a.replaceChildren()
			if (constantPart) {
				$a.append(makeElement('span')('constant')(constantPart))
			}
			if (variablePart) {
				$a.append(makeElement('span')('variable')(variablePart))
			}
		}
	}
	private sendNoteCounts(): void {
		let nFetched=0
		let nVisible=0
		let nSelected=0
		for (const $noteSection of this.$table.tBodies) {
			if (!$noteSection.dataset.noteId) continue
			nFetched++
			if (!$noteSection.hidden) nVisible++
			if (isSelectedNoteSection($noteSection)) nSelected++
		}
		bubbleCustomEvent(this.$table,'osmNoteViewer:noteCountsChange',[nFetched,nVisible,nSelected])
	}
	private noteCheckboxClickListener($checkbox: HTMLInputElement, ev: MouseEvent): void { // need 'click' handler rather than 'change' to stop click propagation
		ev.stopPropagation()
		const $clickedNoteSection=$checkbox.closest('tbody')
		if ($clickedNoteSection) {
			this.setNoteSelection($clickedNoteSection,$checkbox.checked)
			if (ev.shiftKey && this.$lastClickedNoteSection) {
				for (const $inRangeNoteSection of this.listVisibleNoteSectionsInRange(this.$lastClickedNoteSection,$clickedNoteSection)) {
					if ($inRangeNoteSection==$clickedNoteSection) continue
					this.setNoteSelection($inRangeNoteSection,$checkbox.checked)
				}
			}
			this.$lastClickedNoteSection=$clickedNoteSection
		}
		this.updateCheckboxDependentsAndSendNoteChangeEvents()
	}
	private allNotesCheckboxClickListener($allCheckbox: HTMLInputElement, ev: MouseEvent) {
		for (const $noteSection of this.listVisibleNoteSections()) {
			this.setNoteSelection($noteSection,$allCheckbox.checked)
		}
		this.updateCheckboxDependentsAndSendNoteChangeEvents()
	}
	private focusOnNote($noteSection: HTMLTableSectionElement, isSectionClicked: boolean = false): void {
		this.activateNote('click',$noteSection)
		this.noteSectionVisibilityObserver.haltMapFitting() // otherwise scrollIntoView() may ruin note pan/zoom - it may cause observer to fire after exiting this function
		if (!isSectionClicked) $noteSection.scrollIntoView({block:'nearest'})
		const noteId=Number($noteSection.dataset.noteId)
		bubbleCustomEvent($noteSection,'osmNoteViewer:noteFocus',noteId) // TODO correct target, it could be a marker
		if (!this.$selectAllCheckbox.checked && !this.$selectAllCheckbox.indeterminate) {
			const noteId=Number($noteSection.dataset.noteId)
			const note=this.notesById.get(noteId)
			if (note) {
				const noteUsers=new Map<number,string>()
				this.addNoteUsersToMap(noteUsers,note)
				bubbleCustomEvent(this.$table,'osmNoteViewer:notesInput',[[note],noteUsers])
			}
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
				if (type=='click') resetAnimation($noteSection,'active-click-fade')
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
	private updateCheckboxDependentsAndSendNoteChangeEvents(): void {
		const [nFetched,nVisible,selectedNotes,selectedNoteUsers]=this.getCheckedData()
		const hasSelected=selectedNotes.length>0
		const hasUnselected=nVisible>selectedNotes.length
		this.$selectAllCheckbox.indeterminate=hasSelected && hasUnselected
		this.$selectAllCheckbox.checked=hasSelected && !hasUnselected
		bubbleCustomEvent(this.$table,'osmNoteViewer:noteCountsChange',[nFetched,nVisible,selectedNotes.length])
		bubbleCustomEvent(this.$table,'osmNoteViewer:notesInput',[selectedNotes,selectedNoteUsers])
		if (this.mapFitMode=='selectedNotes') this.map.fitSelectedNotes()
	}
	private getCheckedData(): [
		nFetched: number,
		nVisible: number,
		selectedNotes: Note[],
		selectedNoteUsers: Map<number,string>
	] {
		let nFetched=0
		let nVisible=0
		const selectedNotes: Note[] = []
		const selectedNoteUsers=new Map<number,string>()
		for (const $noteSection of this.$table.tBodies) {
			nFetched++
			if ($noteSection.hidden) continue
			nVisible++
			if (!isSelectedNoteSection($noteSection)) continue
			const noteId=Number($noteSection.dataset.noteId)
			const note=this.notesById.get(noteId)
			if (!note) continue
			selectedNotes.push(note)
			this.addNoteUsersToMap(selectedNoteUsers,note)
		}
		return [nFetched,nVisible,selectedNotes,selectedNoteUsers]
	}
	private setNoteSelection($noteSection: HTMLTableSectionElement, isSelected: boolean): void {
		const getTargetLayer=()=>{
			if ($noteSection.hidden) {
				return this.map.filteredNoteLayer
			} else if (isSelected) {
				return this.map.selectedNoteLayer
			} else {
				return this.map.unselectedNoteLayer
			}
		}
		const $checkbox=getNoteSectionCheckbox($noteSection)
		if ($checkbox) $checkbox.checked=isSelected
		const noteId=Number($noteSection.dataset.noteId)
		const note=this.notesById.get(noteId)
		if (!note) return
		const marker=this.map.moveNoteMarkerToLayer(noteId,getTargetLayer())
		if (!marker) return
		marker.updateIcon(this.server.web,note,isSelected)
		const activeClasses=['hover','click'].map(type=>'active-'+type).filter(cls=>$noteSection.classList.contains(cls))
		marker.getElement()?.classList.add(...activeClasses)
	}
	private listVisibleNoteSections(): NodeListOf<HTMLTableSectionElement> {
		return this.$table.querySelectorAll('tbody:not([hidden])')
	}
	private *listVisibleNoteSectionsWithIds(): Generator<[HTMLTableSectionElement,number]> {
		for (const $noteSection of this.listVisibleNoteSections()) {
			const idString=$noteSection.dataset.noteId
			if (!idString) continue
			yield [$noteSection,Number(idString)]
		}
	}
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
			yield $section
			if ($section==$guardSection) {
				return
			}
		}
	}
	private getNoteLink(noteIdOrSection:number|string|HTMLTableSectionElement): HTMLAnchorElement|undefined {
		let $noteSection: HTMLTableSectionElement|undefined
		if (noteIdOrSection instanceof HTMLTableSectionElement) {
			$noteSection=noteIdOrSection
		} else {
			$noteSection=this.getNoteSection(noteIdOrSection)
		}
		const $a=$noteSection?.querySelector('td.note-link a')
		if ($a instanceof HTMLAnchorElement) return $a
	}
	private getNoteSection(noteId:number|string): HTMLTableSectionElement|undefined {
		const $noteSection=document.getElementById(`note-`+noteId) // TODO look in $table
		if (!($noteSection instanceof HTMLTableSectionElement)) return
		return $noteSection
	}
	private addNoteUsersToMap(selectedNoteUsers: Map<number,string>, note: Note): void {
		for (const comment of note.comments) {
			if (comment.uid==null) continue
			const username=this.usersById.get(comment.uid)
			if (username==null) continue
			selectedNoteUsers.set(comment.uid,username)
		}
	}
}

function setUpdateLinkTitle($noteSection: HTMLTableSectionElement, $a: HTMLAnchorElement) {
	const noteReference=($noteSection.dataset.updated
		? `the updated note`
		: `the note`
	)
	const nManualUpdates=$noteSection.dataset.nManualUpdates
	if (!nManualUpdates) {
		$a.title=`reload ${noteReference}`
	} else if (nManualUpdates=='1') {
		$a.title=`reloaded manually, reload ${noteReference} again`
	} else {
		$a.title=`reloaded manually ${nManualUpdates} times, reload ${noteReference} again`
	}
}

function getNoteSectionCheckbox($noteSection: HTMLTableSectionElement): HTMLInputElement|null {
	const $checkbox=$noteSection.querySelector('.note-checkbox input')
	return $checkbox instanceof HTMLInputElement ? $checkbox : null
}

function isSelectedNoteSection($noteSection: HTMLTableSectionElement): boolean {
	return getNoteSectionCheckbox($noteSection)?.checked ?? false
}

function isDefined<T>(argument: T | undefined): argument is T {
	return argument !== undefined
}
