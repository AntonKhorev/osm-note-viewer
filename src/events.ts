export default class GlobalEventListener {
	constructor() {
		document.body.addEventListener('click',ev=>{
			if (!(ev.target instanceof HTMLElement)) return
			const $e=ev.target.closest('a.listened, time.listened')
			if ($e instanceof HTMLAnchorElement) {
				if ($e.dataset.noteId && $e.dataset.self) {
					$e.dispatchEvent(new Event('osmNoteViewer:clickUpdateNoteLink',{bubbles:true}))
				} else if ($e.dataset.noteId) {
					$e.dispatchEvent(new Event('osmNoteViewer:clickNoteLink',{bubbles:true}))
				} else if ($e.dataset.userId) {
					$e.dispatchEvent(new Event('osmNoteViewer:clickUserLink',{bubbles:true}))
				} else if ($e.dataset.elementType && $e.dataset.elementId) {
					$e.dispatchEvent(new Event('osmNoteViewer:clickElementLink',{bubbles:true}))
				} else if ($e.dataset.changesetId) {
					$e.dispatchEvent(new Event('osmNoteViewer:clickChangesetLink',{bubbles:true}))
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
				if ($e.dateTime) {
					$e.dispatchEvent(new CustomEvent<string>('osmNoteViewer:changeTimestamp',{
						bubbles: true,
						detail: $e.dateTime
					}))
					ev.preventDefault()
					ev.stopPropagation()
				}
			}
		},true) // need to capture event before it bubbles to note table sections
		document.body.addEventListener('keydown',ev=>{
			if (!(ev.target instanceof HTMLElement)) return
			if (ev.key!='Enter') return
			const $e=ev.target.closest('time.listened')
			if ($e instanceof HTMLTimeElement) {
				$e.click()
				ev.preventDefault()
				ev.stopPropagation()
			}
		})
	}
}
