type SelectorSpec = [
	generalSelector: string,
	notOnlyFirstCommentSelector?: string,
	onlyFirstCommentSelector?: string
]

const selectors: SelectorSpec[] = [
	['.note-checkbox input'],
	['.note-link a'],
	['.note-date time'],
	['.note-user a'],
	['.note-action [class|=icon]','.note-action [class|=icon-status]','.note-action .icon-comments-count'],
	['.note-comment']
]
const anySelector=selectors.map(([generalSelector])=>generalSelector).join(',')

export default function noteTableKeydownListener(this: HTMLTableElement, ev: KeyboardEvent): void {
	const makeScopedSelector=(selector:SelectorSpec)=>{
		const [
			generalSelector,
			notOnlyFirstCommentSelector,
			onlyFirstCommentSelector
		]=selector
		const tbodySelectorPart=ev.shiftKey?' tbody':'' // prevent shift+movement from reaching 'select all' checkbox
		return (
			`table:not(.only-first-comments)${tbodySelectorPart} ${notOnlyFirstCommentSelector??generalSelector}, `+
			`table.only-first-comments${tbodySelectorPart} tr:first-child ${onlyFirstCommentSelector??generalSelector}`
		)
	}
	if (ev.ctrlKey && ev.key.toLowerCase()=='a') {
		const $allCheckbox=this.querySelector('thead .note-checkbox input')
		if (!($allCheckbox instanceof HTMLInputElement)) return
		$allCheckbox.click()
		ev.stopPropagation()
		ev.preventDefault()
		return
	}
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
	const $e=ev.target.closest(anySelector)
	if (!($e instanceof HTMLElement)) return
	const $section=$e.closest('thead, tbody')
	if (!($section instanceof HTMLTableSectionElement)) return
	const $tr=$e.closest('tr')
	if (!($tr instanceof HTMLTableRowElement)) return
	const iHasCommentRows=2
	for (let i=0;i<selectors.length;i++) {
		const [generalSelector]=selectors[i]
		if (!$e.matches(generalSelector)) continue
		if (isVerticalMovementKey) {
			const $eList=this.querySelectorAll(makeScopedSelector(selectors[i]))
			if (!moveVerticallyAmongProvidedElements(ev.key,$e,$eList,ev.shiftKey&&i==0)) return
		} else if (isHorizontalMovementKey) {
			const j=getIndexForKeyMovement(ev.key,i,selectors.length)
			if (j<0) return
			const $e2=(j<iHasCommentRows?$section:$tr).querySelector(makeScopedSelector(selectors[j]))
			if (!focus($e2)) return
		}
		ev.stopPropagation()
		ev.preventDefault()
	}
}

function moveVerticallyAmongProvidedElements(key: string, $e: HTMLElement, $eList: Iterable<Element>, isSelection: boolean): boolean {
	const $es=[...$eList]
	const i=$es.indexOf($e)
	if (i<0) return false
	let j:number
	if (key=='PageUp' || key=='PageDown') {
		const $scrollingPart=$e.closest('.scrolling')
		if (!($scrollingPart instanceof HTMLElement)) return false
		const scrollRect=$scrollingPart.getBoundingClientRect()
		if (key=='PageUp') {
			j=getNextPageIndex($es,i,-1,0,
				rect=>rect.top>scrollRect.top-scrollRect.height
			)
		} else {
			j=getNextPageIndex($es,i,+1,$es.length-1,
				rect=>rect.bottom<scrollRect.bottom+scrollRect.height
			)
			
		}
	} else {
		j=getIndexForKeyMovement(key,i,$es.length)
	}
	if (i==j) return false
	if (isSelection) {
		checkRange($es,i,j)
	}
	return focus($es[j],key=='Home'||key=='End'||key=='PageUp'||key=='PageDown')
}

function getNextPageIndex(
	$es: Element[],
	fromIndex: number,
	d: number,
	indexBound: number,
	checkRect: (rect:DOMRect)=>boolean
): number {
	const checkIndexBound=(k:number)=>k*d<indexBound*d
	for (let j=fromIndex;checkIndexBound(j);j+=d) {
		if (checkRect($es[j].getBoundingClientRect())) continue
		if (j*d>fromIndex*d) {
			return j
		} else {
			return j+d
		}
	}
	if (checkIndexBound(fromIndex)) {
		return indexBound
	}
	return fromIndex
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

function checkRange($es: Element[], fromIndex: number, toIndex: number): void {
	$es[fromIndex].dispatchEvent(
		new MouseEvent('click')
	)
	$es[toIndex].dispatchEvent(
		new MouseEvent('click',{shiftKey:true})
	)
}
