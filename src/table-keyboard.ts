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
	const $e=ev.target
	if (!($e instanceof HTMLElement)) return
	const $section=$e.closest('thead, tbody')
	if (!($section instanceof HTMLTableSectionElement)) return
	const $tr=$e.closest('tr')
	if (!($tr instanceof HTMLTableRowElement)) return
	const focusInAllSections=(selector:string)=>focusInList(ev.key,$e,this.querySelectorAll(
		':where(:scope:not(.only-first-comments), :scope.only-first-comments tr:first-child) '+selector
	))
	const selectors=[
		'.note-checkbox input',
		'.note-link a',
		'.note-date time',
		'.note-user a',
		'.note-action',
		'.note-comment'
	]
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
	return focus($es[getIndexForKeyMovement(key,i,$es.length)])
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

function focus($e: Element|null|undefined): boolean {
	if (!($e instanceof HTMLElement)) return false
	$e.focus()
	return true
}
