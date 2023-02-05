const selectors=[
	'.note-checkbox input',
	'.note-link a',
	'.note-date time',
	'.note-user a',
	'.note-action .icon-container',
	'.note-comment'
]

export default function noteTableKeydownListener(this: HTMLTableElement, ev: KeyboardEvent): void {
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
	const $e=ev.target.closest(selectors.join(','))
	if (!($e instanceof HTMLElement)) return
	const $section=$e.closest('thead, tbody')
	if (!($section instanceof HTMLTableSectionElement)) return
	const $tr=$e.closest('tr')
	if (!($tr instanceof HTMLTableRowElement)) return
	const iHasCommentRows=2
	for (let i=0;i<selectors.length;i++) {
		if (!$e.matches(selectors[i])) continue
		if (isVerticalMovementKey) {
			const scopedSelector=':where(:scope:not(.only-first-comments), :scope tr:first-child) '+selectors[i]
			if (!moveVerticallyAmongProvidedElements(ev,$e,this.querySelectorAll(scopedSelector),i==0)) return
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

function moveVerticallyAmongProvidedElements(ev: KeyboardEvent, $e: HTMLElement, $esi: Iterable<Element>, isSelectionCheckbox: boolean): boolean {
	const $es=[...$esi]
	const i=$es.indexOf($e)
	if (i<0) return false
	if (ev.key=='PageUp' || ev.key=='PageDown') {
		const $scrollingPart=$e.closest('.scrolling')
		if (!($scrollingPart instanceof HTMLElement)) return false
		const scrollRect=$scrollingPart.getBoundingClientRect()
		const scrollToNextPage=(
			d:number,
			indexBound:number,
			checkRect:(rect:DOMRect)=>boolean
		):boolean=>{
			const checkIndexBound=(k:number)=>k*d<indexBound*d
			for (let j=i;checkIndexBound(j);j+=d) {
				if (checkRect($es[j].getBoundingClientRect())) continue
				if (j*d>i*d) {
					return focus($es[j],true)
				} else {
					return focus($es[j+d],true)
				}
			}
			if (checkIndexBound(i)) {
				return focus($es[indexBound],true)
			}
			return false
		}
		if (ev.key=='PageUp') {
			return scrollToNextPage(
				-1,0,
				rect=>rect.top>scrollRect.top-scrollRect.height
			)
		} else {
			return scrollToNextPage(
				+1,$es.length-1,
				rect=>rect.bottom<scrollRect.bottom+scrollRect.height
			)
		}
	} else {
		const j=getIndexForKeyMovement(ev.key,i,$es.length)
		if (isSelectionCheckbox && ev.shiftKey) {
			return checkRange($es,i,j)
		} else {
			return focus($es[j],ev.key=='Home'||ev.key=='End')
		}
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

function checkRange($es: Element[], fromIndex: number, toIndex: number) {
	const d=toIndex>fromIndex?1:-1
	for (let i=fromIndex;i*d<toIndex*d;i+=d) {
		const $checkbox=$es[i]
		if (!($checkbox instanceof HTMLInputElement)) continue
		$checkbox.checked=true
	}
	const $lastCheckbox=$es[toIndex]
	if (!($lastCheckbox instanceof HTMLInputElement)) return false
	if ($lastCheckbox.checked) $lastCheckbox.checked=false
	$lastCheckbox.click()
	return focus($lastCheckbox)
}
