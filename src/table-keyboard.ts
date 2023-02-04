export default function noteTableKeydownListener(this: HTMLTableElement, ev: KeyboardEvent): void {
	const isVerticalMovementKey=(
		ev.key=='ArrowUp' ||
		ev.key=='ArrowDown' ||
		ev.key=='Home' && ev.ctrlKey ||
		ev.key=='End' && ev.ctrlKey
	)
	const isHorizontalMovementKey=(
		ev.key=='ArrowLeft' ||
		ev.key=='ArrowRight' ||
		ev.key=='Home' && !ev.ctrlKey ||
		ev.key=='End' && !ev.ctrlKey
	)
	if (!isVerticalMovementKey && !isHorizontalMovementKey) return
	if (!(ev.target instanceof HTMLElement)) return
	const $noteSection=ev.target.closest('thead, tbody')
	if (!($noteSection instanceof HTMLTableSectionElement)) return
	const $checkbox=$noteSection.querySelector('.note-checkbox input')
	const $a=$noteSection.querySelector('.note-link a')
	const $dates=[...$noteSection.querySelectorAll('.note-date time')]
	const wasOnNthDate=$dates.indexOf(ev.target)
	const getSiblingNoteSection=(includeHeading:boolean)=>{
		let $siblingNoteSection: Element|null|undefined
		if (ev.key=='ArrowUp') {
			$siblingNoteSection=$noteSection.previousElementSibling
		} else if (ev.key=='ArrowDown') {
			$siblingNoteSection=$noteSection.nextElementSibling
		} else if (ev.key=='Home') {
			$siblingNoteSection=$noteSection.parentElement?.firstElementChild
			if (!includeHeading) $siblingNoteSection=$siblingNoteSection?.nextElementSibling
		} else if (ev.key=='End') {
			$siblingNoteSection=$noteSection.parentElement?.lastElementChild
		}
		if (!($siblingNoteSection instanceof HTMLTableSectionElement)) return undefined
		return $siblingNoteSection
	}
	const focusInSiblingNoteSection=(includeHeading:boolean,selector:string):boolean=>{
		return focus(getSiblingNoteSection(includeHeading)?.querySelector(selector))
	}
	if (ev.target==$checkbox) {
		if (isVerticalMovementKey) {
			if (!focusInSiblingNoteSection(true,'.note-checkbox input')) return
		} else if (ev.key=='ArrowRight') {
			if (!focus($a)) return
		}
	} else if (ev.target==$a) {
		if (isVerticalMovementKey) {
			if (!focusInSiblingNoteSection(false,'.note-link a')) return
		} else if (ev.key=='ArrowLeft') {
			if (!focus($checkbox)) return
		} else if (ev.key=='ArrowRight') {
			if (!focus($dates[0])) return
		}
	} else if (wasOnNthDate>=0) {
		if (isVerticalMovementKey) {
			const $allDates=[...this.querySelectorAll('.note-date time')]
			const i=$allDates.indexOf(ev.target)
			if (i<0) return
			if (ev.key=='ArrowUp') {
				if (!focus($allDates[i-1])) return
			} else if (ev.key=='ArrowDown') {
				if (!focus($allDates[i+1])) return
			} else if (ev.key=='Home') {
				if (!focus($allDates[0])) return
			} else if (ev.key=='End') {
				if (!focus($allDates[$allDates.length-1])) return
			}
		} else if (ev.key=='ArrowLeft') {
			if (!focus($a)) return
		}
	} else {
		return
	}
	ev.stopPropagation()
	ev.preventDefault()
}

function focus($e: Element|null|undefined): boolean {
	if (!($e instanceof HTMLElement)) return false
	$e.focus()
	return true
}
