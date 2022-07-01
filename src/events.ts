export default class GlobalEventListener {
	userListener?: ($a: HTMLAnchorElement, uid: number, username?: string) => void
	elementListener?: ($a: HTMLAnchorElement, elementType: string, elementId: string) => void
	changesetListener?: ($a: HTMLAnchorElement, changesetId: string) => void
	timestampListener?: (timestamp: string) => void
	constructor() {
		document.body.addEventListener('click',ev=>{
			if (!(ev.target instanceof HTMLElement)) return
			const $e=ev.target.closest('a.listened, time.listened')
			if ($e instanceof HTMLAnchorElement) {
				if (this.userListener && $e.dataset.userId) {
					ev.preventDefault()
					ev.stopPropagation()
					this.userListener($e,Number($e.dataset.userId),$e.dataset.userName)
				} else if (this.elementListener && $e.dataset.elementType && $e.dataset.elementId) {
					ev.preventDefault()
					ev.stopPropagation()
					this.elementListener($e,$e.dataset.elementType,$e.dataset.elementId)
				} else if (this.changesetListener && $e.dataset.changesetId) {
					ev.preventDefault()
					ev.stopPropagation()
					this.changesetListener($e,$e.dataset.changesetId)
				}
			} else if ($e instanceof HTMLTimeElement) {
				if (this.timestampListener && $e.dateTime) {
					ev.stopPropagation()
					this.timestampListener($e.dateTime)
				}
			}
		},true) // need to capture event before it bubbles to note table sections
	}
}
