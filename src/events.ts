export default class GlobalEventListener {
	noteSelfListener?: ($a: HTMLAnchorElement, noteId: string) => void
	elementListener?: ($a: HTMLAnchorElement, elementType: string, elementId: string) => void
	changesetListener?: ($a: HTMLAnchorElement, changesetId: string) => void
	timestampListener?: (timestamp: string) => void
	constructor() {
		document.body.addEventListener('click',ev=>{
			if (!(ev.target instanceof HTMLElement)) return
			const $e=ev.target.closest('a.listened, time.listened')
			if ($e instanceof HTMLAnchorElement) {
				if (this.noteSelfListener && $e.dataset.noteId && $e.dataset.self) {
					this.noteSelfListener($e,$e.dataset.noteId)
				} else if ($e.dataset.noteId) {
					$e.dispatchEvent(new Event('osmNoteViewer:clickNoteLink',{bubbles:true}))
				} else if ($e.dataset.userId) {
					$e.dispatchEvent(new Event('osmNoteViewer:clickUserLink',{bubbles:true}))
				} else if (this.elementListener && $e.dataset.elementType && $e.dataset.elementId) {
					this.elementListener($e,$e.dataset.elementType,$e.dataset.elementId)
				} else if (this.changesetListener && $e.dataset.changesetId) {
					this.changesetListener($e,$e.dataset.changesetId)
				} else if ($e.dataset.zoom && $e.dataset.lat && $e.dataset.lon) {
					$e.dispatchEvent(new Event('osmNoteViewer:clickMapLink',{bubbles:true}))
				} else if ($e.classList.contains('image')) {
					$e.dispatchEvent(new Event('osmNoteViewer:toggleImage',{bubbles:true}))
				} else {
					return // don't stop event propagation
				}
				ev.preventDefault()
				ev.stopPropagation()
			} else if ($e instanceof HTMLTimeElement) {
				if (this.timestampListener && $e.dateTime) {
					ev.stopPropagation()
					this.timestampListener($e.dateTime)
				}
			}
		},true) // need to capture event before it bubbles to note table sections
		document.body.addEventListener('keydown',ev=>{
			if (!(ev.target instanceof HTMLElement)) return
			if (ev.key!='Enter') return
			const $e=ev.target.closest('time.listened')
			if ($e instanceof HTMLTimeElement) {
				if (this.timestampListener && $e.dateTime) {
					ev.stopPropagation()
					this.timestampListener($e.dateTime)
				}
			}
		})
	}
}
