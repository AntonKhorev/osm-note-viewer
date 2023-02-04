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
	const focusInAllSections=(selector:string)=>focusInList(ev.key,$e,this.querySelectorAll(selector))
	const selectors=[
		'.note-checkbox input',
		'.note-link a',
		'.note-date time',
		'.note-user a',
		'.note-action',
		'.note-comment'
	]
	const rowSelector=selectors.join(',')
	const focusInOwnSection=()=>focusInList(ev.key,$e,$section.querySelectorAll(rowSelector))
	const focusInOwnRow=()=>focusInList(ev.key,$e,$tr.querySelectorAll(rowSelector))
	const iHasCommentRows=2
	for (let i=0;i<selectors.length;i++) {
		if (!$e.matches(selectors[i])) continue
		const focusInHorizontalNeighbor=(j:number)=>(j<iHasCommentRows?focusInOwnSection:focusInOwnRow)()
		if (isVerticalMovementKey) {
			if (!focusInAllSections(selectors[i])) return
		} else if (ev.key=='ArrowLeft' || ev.key=='Home') {
			if (!focusInHorizontalNeighbor(i-1)) return
		} else if (ev.key=='ArrowRight' || ev.key=='End') {
			if (!focusInHorizontalNeighbor(i+1)) return
		}
		ev.stopPropagation()
		ev.preventDefault()
	}
}

function focusInList(key: string, $e: HTMLElement, $esi: Iterable<Element>): boolean {
	const $es=[...$esi]
	const i=$es.indexOf($e)
	if (i<0) return false
	if (key=='ArrowUp' || key=='ArrowLeft') {
		return focus($es[i-1])
	} else if (key=='ArrowDown' || key=='ArrowRight') {
		return focus($es[i+1])
	} else if (key=='Home') {
		return focus($es[0])
	} else if (key=='End') {
		return focus($es[$es.length-1])
	}
	return false
}

function focus($e: Element|null|undefined): boolean {
	if (!($e instanceof HTMLElement)) return false
	$e.focus()
	return true
}
