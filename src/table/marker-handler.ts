import type {Note} from '../data'
import type NoteMap from '../map'
import {NoteMarker} from '../map'
import type {WebProvider} from '../net'
import {isSelectedNoteSection} from './section'

export default class NoteMarkerHandler {
	constructor(
		private map: NoteMap,
		private web: WebProvider,
		private wrappedMarkerLinkListeners: Array<[event: string, listener: (this:HTMLAnchorElement,ev:Event)=>void]>
	) {}
	makeMarker(note: Note, isVisible: boolean, isSelected: boolean): NoteMarker {
		const marker=new NoteMarker(this.web,note)
		marker.addTo(this.getTargetLayer(isVisible,isSelected))
		for (const [event,listener] of this.wrappedMarkerLinkListeners) {
			marker.$a.addEventListener(event,listener)
		}
		return marker
	}
	updateMarker($noteSection: HTMLTableSectionElement, getNote: (id:number)=>Note|undefined): void {
		const noteId=Number($noteSection.dataset.noteId)
		const note=getNote(noteId)
		if (!note) return
		this.updateMarkerWithNote($noteSection,note)
	}
	updateMarkerWithNote($noteSection: HTMLTableSectionElement, note: Note) {
		const isVisible=!$noteSection.hidden
		const isSelected=isSelectedNoteSection($noteSection)
		const marker=this.map.moveNoteMarkerToLayer(note.id,this.getTargetLayer(isVisible,isSelected))
		if (!marker) return
		marker.updateIcon(this.web,note,isSelected)
		this.updateMarkerActivationWithMarker($noteSection,marker)
	}
	private getTargetLayer(isVisible: boolean, isSelected: boolean) {
		if (!isVisible) {
			return this.map.filteredNoteLayer
		} else if (isSelected) {
			return this.map.selectedNoteLayer
		} else {
			return this.map.unselectedNoteLayer
		}
	}
	updateMarkerActivation($noteSection: HTMLTableSectionElement): void {
		const noteId=Number($noteSection.dataset.noteId)
		const marker=this.map.getNoteMarker(noteId)
		if (!marker) return
		this.updateMarkerActivationWithMarker($noteSection,marker)
	}
	private updateMarkerActivationWithMarker($noteSection: HTMLTableSectionElement, marker: NoteMarker): void {
		let hasSomeActivationClasses=false
		for (const type of ['hover','click']) {
			const activationClassName='active-'+type
			const hasActivationClass=$noteSection.classList.contains(activationClassName)
			hasSomeActivationClasses||=hasActivationClass
			marker.getElement()?.classList.toggle(activationClassName,hasActivationClass)
		}
		marker.setZIndexOffset(hasSomeActivationClasses?1000:0)
	}
}
