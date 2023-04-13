import type {Note} from '../data'
import type NoteMap from '../map'
import {NoteMarker} from '../map'
import type {WebProvider} from '../net'

export default class NoteMarkerHandler {
	constructor(
		private map: NoteMap,
		private web: WebProvider,
		private wrappedMarkerLinkListeners: Array<[event: string, listener: (this:HTMLAnchorElement,ev:Event)=>void]>
	) {}
	makeMarker(note: Note, isVisible: boolean, isSelected: boolean): NoteMarker { // TODO use isSelected
		const marker=new NoteMarker(this.web,note)
		marker.addTo(isVisible ? this.map.unselectedNoteLayer : this.map.filteredNoteLayer)
		for (const [event,listener] of this.wrappedMarkerLinkListeners) {
			marker.$a.addEventListener(event,listener)
		}
		return marker
	}
}
