export default function noteSectionKeydownListener(this: HTMLTableSectionElement, ev: KeyboardEvent): void {
	const $noteSection=this
	const $checkbox=$noteSection.querySelector('.note-checkbox input')
	const $a=$noteSection.querySelector('.note-link a')
	const wasOnCheckbox=ev.target==$checkbox
	const wasOnLink=ev.target==$a
	if (!(wasOnCheckbox || wasOnLink)) return
	if (['ArrowUp','ArrowDown','Home','End'].includes(ev.key)) {
		let $siblingNoteSection: Element|null|undefined
		if (ev.key=='ArrowUp') {
			$siblingNoteSection=$noteSection.previousElementSibling
		} else if (ev.key=='ArrowDown') {
			$siblingNoteSection=$noteSection.nextElementSibling
		} else if (ev.key=='Home') {
			$siblingNoteSection=$noteSection.parentElement?.firstElementChild
			if (wasOnLink) $siblingNoteSection=$siblingNoteSection?.nextElementSibling
		} else if (ev.key=='End') {
			$siblingNoteSection=$noteSection.parentElement?.lastElementChild
		}
		if (!($siblingNoteSection instanceof HTMLTableSectionElement)) return
		const focus=(selector:string):boolean=>{
			const $e=$siblingNoteSection?.querySelector(selector)
			if (!($e instanceof HTMLElement)) return false
			$e.focus()
			return true
		}
		if (wasOnCheckbox) {
			if (!focus('.note-checkbox input')) return
		}
		if (wasOnLink) {
			if (!focus('.note-link a')) return
		}
	} else if (ev.key=='ArrowLeft' && wasOnLink && ($checkbox instanceof HTMLInputElement)) {
		$checkbox.focus()
	} else if (ev.key=='ArrowRight' && wasOnCheckbox && ($a instanceof HTMLAnchorElement)) {
		$a.focus()
	} else {
		return
	}
	ev.stopPropagation()
	ev.preventDefault()
}
