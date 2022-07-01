export default class GlobalEventListener {
	userListener?: (uid: number, username?: string) => void
	timestampListener?: (timestamp: string) => void
	constructor() {
		document.body.addEventListener('click',ev=>{
			if (!(ev.target instanceof HTMLElement)) return
			const $e=ev.target.closest('a.listened, time.listened')
			if ($e instanceof HTMLAnchorElement) {
				if (this.userListener && $e.dataset.userId) {
					ev.preventDefault()
					ev.stopPropagation()
					this.userListener(
						Number($e.dataset.userId),
						$e.dataset.userName
					)
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
