type SelectorSpec = [
	headSelector: string,
	generalSelector: string,
	notOnlyFirstCommentSelector?: string,
	onlyFirstCommentSelector?: string
]

const selectors: SelectorSpec[] = [
	['.note-checkbox input','.note-checkbox input'],
	['.note-link button','.note-link a'],
	['.note-date button','.note-date time'],
	['.note-user button','.note-user a'],
	['.note-action button','.note-action [class|=icon]','.note-action [class|=icon-status]','.note-action .icon-comments-count'],
	['.note-comment button','.note-comment']
]

const makeHeadSelector=([headSelector]:SelectorSpec)=>headSelector
const makeScopedSelector=([
		headSelector,
		generalSelector,
		notOnlyFirstCommentSelector,
		onlyFirstCommentSelector
]:SelectorSpec)=>{
	return (
		`table.expanded-comments tbody ${notOnlyFirstCommentSelector??generalSelector}, `+
		`table:not(.expanded-comments) tbody tr:first-child ${onlyFirstCommentSelector??generalSelector}`
	)
}

const anySelector=selectors.map(([,generalSelector])=>generalSelector).join(',')
const anyHeadSelector=selectors.map(([headSelector])=>headSelector).join(',')

const iHasCommentRows=2

export function noteTableKeydownListener(this: HTMLTableElement, ev: KeyboardEvent): void {
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
	const $section=ev.target.closest('thead, tbody')
	if (!($section instanceof HTMLTableSectionElement)) return
	if ($section.tagName=='THEAD') {
		const $e=ev.target.closest(anyHeadSelector)
		if (!($e instanceof HTMLElement)) return
		for (let i=0;i<selectors.length;i++) {
			const [headSelector]=selectors[i]
			if (!$e.matches(headSelector)) continue
			if (isVerticalMovementKey) {
				return
			} else if (isHorizontalMovementKey) {
				const j=getIndexForKeyMovement(ev.key,i,selectors.length)
				if (j<0 || j>=selectors.length) return
				const $e2=$section.querySelector(makeHeadSelector(selectors[j]))
				if (!focus($e2)) return
				roveHeadTabIndex(this,$e2,j)
			}
			ev.stopPropagation()
			ev.preventDefault()
		}
	} else {
		const $e=ev.target.closest(anySelector)
		if (!($e instanceof HTMLElement)) return
		const $tr=$e.closest('tr')
		if (!($tr instanceof HTMLTableRowElement)) return
		for (let i=0;i<selectors.length;i++) {
			const [,generalSelector]=selectors[i]
			if (!$e.matches(generalSelector)) continue
			if (isVerticalMovementKey) {
				const $eList=this.querySelectorAll(makeScopedSelector(selectors[i]))
				const $e2=moveVerticallyAmongProvidedElements(ev.key,$e,$eList,ev.shiftKey&&i==0)
				if (!$e2) return
				roveBodyTabIndex(this,$e2,i)
			} else if (isHorizontalMovementKey) {
				const j=getIndexForKeyMovement(ev.key,i,selectors.length)
				if (j<0 || j>=selectors.length) return
				const $e2=(j<iHasCommentRows?$section:$tr).querySelector(makeScopedSelector(selectors[j]))
				if (!focus($e2)) return
				roveBodyTabIndex(this,$e2,j)
			}
			ev.stopPropagation()
			ev.preventDefault()
		}
	}
}

function moveVerticallyAmongProvidedElements(key: string, $e: HTMLElement, $eList: Iterable<Element>, isSelection: boolean): HTMLElement|null {
	const $es=[...$eList]
	const i=$es.indexOf($e)
	if (i<0) return null
	let j:number
	if (key=='PageUp' || key=='PageDown') {
		const $scrollingPart=$e.closest('.scrolling')
		if (!($scrollingPart instanceof HTMLElement)) return null
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
	if (i==j) return null
	if (isSelection) {
		checkRange($es,i,j)
	}
	const $e2=$es[j]
	return focus($e2,key=='Home'||key=='End'||key=='PageUp'||key=='PageDown') ? $e2 : null
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

function focus($e: Element|null|undefined, far: boolean = false): $e is HTMLElement {
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

const tabbableSelector=`a[href]:not([tabindex="-1"]), input:not([tabindex="-1"]), button:not([tabindex="-1"]), [tabindex="0"]`

function roveHeadTabIndex($table: HTMLTableElement, $focused: HTMLElement, i: number) {
	for (const $e of $table.querySelectorAll(`thead :is(${tabbableSelector})`)) {
		if ($e instanceof HTMLElement) $e.tabIndex=-1
	}
	$focused.tabIndex=0
	const $tabbableInBody=$table.querySelector(`tbody :is(${tabbableSelector})`)
	let $bodySectionOrRowWithTabbable: HTMLTableSectionElement|HTMLTableRowElement|null = null
	if ($tabbableInBody instanceof HTMLElement) {
		const $tr=$tabbableInBody.closest('tr')
		const $section=$tabbableInBody.closest('tbody')
		$bodySectionOrRowWithTabbable=(i<iHasCommentRows?$section:$tr)
	}
	for (const $e of $table.querySelectorAll(`tbody :is(${tabbableSelector})`)) {
		if ($e instanceof HTMLElement) $e.tabIndex=-1
	}
	if ($bodySectionOrRowWithTabbable) {
		const $e=$bodySectionOrRowWithTabbable.querySelector(makeScopedSelector(selectors[i]))
		if ($e instanceof HTMLElement) $e.tabIndex=0
	} else {
		const $e=$table.querySelector('tbody input')
		if ($e instanceof HTMLElement) $e.tabIndex=0
	}
}

function roveBodyTabIndex($table: HTMLTableElement, $focused: HTMLElement, i: number) {
	for (const $e of $table.querySelectorAll(`tbody :is(${tabbableSelector})`)) {
		if ($e instanceof HTMLElement) $e.tabIndex=-1
	}
	$focused.tabIndex=0
	if ($table.tHead) {
		for (const $e of $table.tHead.querySelectorAll(tabbableSelector)) {
			if ($e instanceof HTMLElement) $e.tabIndex=-1
		}
		{
			const $e=$table.tHead.querySelector(makeHeadSelector(selectors[i]))
			if ($e instanceof HTMLElement) $e.tabIndex=0
		}
	}
}

export function noteTableCleanupRovingTabindex($table: HTMLTableElement) {
	const $e=$table.querySelector(`tbody :is(${tabbableSelector})`)
	if ($e instanceof HTMLElement) {
		for (let i=0;i<selectors.length;i++) {
			const [,generalSelector]=selectors[i]
			if ($e.matches(generalSelector)) {
				roveBodyTabIndex($table,$e,i)
				return
			}
			const $e2=$e.closest(generalSelector)
			if ($e2 instanceof HTMLElement) {
				roveBodyTabIndex($table,$e2,i)
			}
		}
	}
	{
		const $e=$table.querySelector('tbody input')
		if (!($e instanceof HTMLElement)) return
		roveBodyTabIndex($table,$e,0)
	}
}
