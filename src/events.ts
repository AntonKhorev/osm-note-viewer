import {bubbleEvent, bubbleCustomEvent} from "./html"

export default class GlobalEventListener {
	constructor() {
		document.body.addEventListener('click',ev=>{
			if (!(ev.target instanceof HTMLElement)) return
			const $e=ev.target.closest('a.listened, time.listened')
			if ($e instanceof HTMLAnchorElement) {
				if ($e.dataset.noteId && $e.dataset.self) {
					bubbleEvent($e,'osmNoteViewer:updateNoteLinkClick')
				} else if ($e.dataset.noteId) {
					bubbleEvent($e,'osmNoteViewer:noteLinkClick')
				} else if ($e.dataset.userId) {
					bubbleEvent($e,'osmNoteViewer:userLinkClick')
				} else if ($e.dataset.elementType && $e.dataset.elementId) {
					bubbleEvent($e,'osmNoteViewer:elementLinkClick')
				} else if ($e.dataset.changesetId) {
					bubbleEvent($e,'osmNoteViewer:changesetLinkClick')
				} else if ($e.dataset.zoom && $e.dataset.lat && $e.dataset.lon) {
					bubbleCustomEvent($e,'osmNoteViewer:mapMoveTrigger',{
						zoom: $e.dataset.zoom,
						lat: $e.dataset.lat,
						lon: $e.dataset.lon,
					})
				} else if ($e.classList.contains('image')) {
					bubbleEvent($e,'osmNoteViewer:imageToggle')
				} else {
					return // don't stop event propagation
				}
				ev.preventDefault()
				ev.stopPropagation()
			} else if ($e instanceof HTMLTimeElement) {
				if ($e.dateTime) {
					bubbleCustomEvent($e,'osmNoteViewer:timestampChange',$e.dateTime)
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
