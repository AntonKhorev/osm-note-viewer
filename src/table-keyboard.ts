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
	const focusInOwnSection=(selector:string):boolean=>{
		return focus($section.querySelector(selector))
	}
	const focusInOwnRow=(selector:string):boolean=>{
		return focus($tr.querySelector(selector))
	}
	if (ev.target.matches('.note-checkbox input')) {
		if (isVerticalMovementKey) {
			if (!focusInAllSections('.note-checkbox input')) return
		} else if (ev.key=='ArrowRight') {
			if (!focusInOwnSection('.note-link a')) return
		}
	} else if (ev.target.matches('.note-link a')) {
		if (isVerticalMovementKey) {
			if (!focusInAllSections('.note-link a')) return
		} else if (ev.key=='ArrowLeft') {
			if (!focusInOwnSection('.note-checkbox input')) return
		} else if (ev.key=='ArrowRight') {
			if (!focusInOwnSection('.note-date time')) return
		}
	} else if (ev.target.matches('.note-date time')) {
		if (isVerticalMovementKey) {
			if (!focusInAllSections('.note-date time')) return
		} else if (ev.key=='ArrowLeft') {
			if (!focusInOwnSection('.note-link a')) return
		} else if (ev.key=='ArrowRight') {
			if (!focusInOwnRow('.note-user a')) return
		}
	} else if (ev.target.matches('.note-user a')) {
		if (isVerticalMovementKey) {
			if (!focusInAllSections('.note-user a')) return
		} else if (ev.key=='ArrowLeft') {
			if (!focusInOwnRow('.note-date time')) return
		} else if (ev.key=='ArrowRight') {
			if (!focusInOwnRow('.note-action')) return
		}
	} else if (ev.target.matches('.note-action')) {
		if (isVerticalMovementKey) {
			if (!focusInAllSections('.note-action')) return
		} else if (ev.key=='ArrowLeft') {
			if (!focusInOwnRow('.note-user a')) return
		} else if (ev.key=='ArrowRight') {
			if (!focusInOwnRow('.note-comment')) return
		}
	} else if (ev.target.matches('.note-comment')) {
		if (isVerticalMovementKey) {
			if (!focusInAllSections('.note-comment')) return
		} else if (ev.key=='ArrowLeft') {
			if (!focusInOwnRow('.note-action')) return
		}
	} else {
		return
	}
	ev.stopPropagation()
	ev.preventDefault()
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
