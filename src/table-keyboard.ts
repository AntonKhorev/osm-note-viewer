const selectors=[
	'.note-checkbox input',
	'.note-link a',
	'.note-date time',
	'.note-user a',
	'.note-action',
	'.note-comment'
]

export default function noteTableKeydownListener(this: HTMLTableElement, ev: KeyboardEvent): void {
	const isVerticalMovementKey=(
		ev.key=='ArrowUp' ||
		ev.key=='ArrowDown' ||
		ev.key=='Home' && ev.ctrlKey ||
		ev.key=='End' && ev.ctrlKey ||
		ev.key=='PageUp' ||
		ev.key=='PageDown'
	)
	const isHorizontalMovementKey=(
		ev.key=='ArrowLeft' ||
		ev.key=='ArrowRight' ||
		ev.key=='Home' && !ev.ctrlKey ||
		ev.key=='End' && !ev.ctrlKey
	)
	if (!isVerticalMovementKey && !isHorizontalMovementKey) return
	if (!(ev.target instanceof HTMLElement)) return
	const $e=ev.target.closest(selectors.join(','))
	if (!($e instanceof HTMLElement)) return
	const $section=$e.closest('thead, tbody')
	if (!($section instanceof HTMLTableSectionElement)) return
	const $tr=$e.closest('tr')
	if (!($tr instanceof HTMLTableRowElement)) return
	const focusInAllSections=(selector:string)=>focusInList(ev.key,$e,this.querySelectorAll(
		':where(:scope:not(.only-first-comments), :scope tr:first-child) '+selector
	))
	const iHasCommentRows=2
	for (let i=0;i<selectors.length;i++) {
		if (!$e.matches(selectors[i])) continue
		if (isVerticalMovementKey) {
			if (!focusInAllSections(selectors[i])) return
		} else if (isHorizontalMovementKey) {
			const j=getIndexForKeyMovement(ev.key,i,selectors.length)
			if (j<0) return
			const $e2=(j<iHasCommentRows?$section:$tr).querySelector(selectors[j])
			if (!focus($e2)) return
		}
		ev.stopPropagation()
		ev.preventDefault()
	}
}

function focusInList(key: string, $e: HTMLElement, $esi: Iterable<Element>): boolean {
	const $es=[...$esi]
	const i=$es.indexOf($e)
	if (i<0) return false
	if (key=='PageUp' || key=='PageDown') {
		const $scrollingPart=$e.closest('.scrolling')
		if (!($scrollingPart instanceof HTMLElement)) return false
		const scrollRect=$scrollingPart.getBoundingClientRect()
		if (key=='PageUp') {
			for (let j=i;j>=0;j--) {
				const e2rect=$es[j].getBoundingClientRect()
				if (e2rect.top>scrollRect.top-scrollRect.height) continue
				if (j<i) {
					return focus($es[j],true)
				} else if (i>0) {
					return focus($es[i-1],true)
				} else {
					return false
				}
			}
		} else {
			for (let j=i;j<$es.length;j++) {
				const e2rect=$es[j].getBoundingClientRect()
				if (e2rect.bottom<scrollRect.bottom+scrollRect.height)  continue
				if (j>i) {
					return focus($es[j],true)
				} else if (i<$es.length-1) {
					return focus($es[i+1],true)
				} else {
					return false
				}
			}
		}
		return false
	} else {
		const j=getIndexForKeyMovement(key,i,$es.length)
		return focus($es[j],key=='Home'||key=='End')
	}
}

function getIndexForKeyMovement(key: string, i: number, length: number): number {
	if (key=='ArrowUp' || key=='ArrowLeft') {
		return i-1
	} else if (key=='ArrowDown' || key=='ArrowRight') {
		return i+1
	} else if (key=='Home') {
		return 0
	} else if (key=='End') {
		return length-1
	}
	return -1
}

function focus($e: Element|null|undefined, far: boolean = false): boolean {
	if (!($e instanceof HTMLElement)) return false
	if (far) {
		$e.focus({preventScroll:true})
		$e.scrollIntoView({block:'nearest',behavior:'smooth'}) // TODO delay map autozoom to notes on screen in table
	} else {
		$e.focus()
		$e.scrollIntoView({block:'nearest'})
	}
	return true
}
