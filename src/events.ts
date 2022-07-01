export default class GlobalEventListener {
	userListener?: (uid: number, username?: string) => void
	constructor() {
		document.body.addEventListener('click',ev=>{
			if (!(ev.target instanceof HTMLElement)) return
			const $a=ev.target.closest('a.listened')
			if (!($a instanceof HTMLAnchorElement)) return
			if (this.userListener && $a.dataset.userId!=null) {
				ev.preventDefault()
				ev.stopPropagation()
				this.userListener(
					Number($a.dataset.userId),
					$a.dataset.userName
				)
			}
		})
	}
}
