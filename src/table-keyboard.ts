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
	const $section=ev.target.closest('thead, tbody')
	if (!($section instanceof HTMLTableSectionElement)) return
	const $tr=ev.target.closest('tr')
	if (!($tr instanceof HTMLTableRowElement)) return
	const focusInAllSections=(selector:string):boolean=>{
		if (!(ev.target instanceof HTMLElement)) return false
		return focusInList(ev.key,ev.target,this.querySelectorAll(selector))
	}
	const focusInOwnSection=(selector:string)=>focus($section.querySelector(selector))
	const focusInOwnRow=(selector:string)=>focus($tr.querySelector(selector))
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
		if (!ev.target.matches(selectors[i])) continue
		const focusInHorizontalNeighbor=(j:number)=>(j<iHasCommentRows?focusInOwnSection:focusInOwnRow)(selectors[j])
		if (isVerticalMovementKey) {
			if (!focusInAllSections(selectors[i])) return
		} else if (ev.key=='ArrowLeft' && i>0) {
			if (!focusInHorizontalNeighbor(i-1)) return
		} else if (ev.key=='ArrowRight') {
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
