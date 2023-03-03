import type Pager from './pager'

const selectors: [headSelector:string,bodySelector:string][] = [
	['.note-checkbox input','.note-checkbox input'],
	['.note-link button','.note-link a'],
	['.note-comments-count button','.note-comments-count button'],
	['.note-date button','.note-date time'],
	['.note-user button','.note-user a'],
	['.note-action','.note-action [class|=icon]'],
	['.note-comment button','.note-comment'],
	['.note-map button','.note-map a'],
]
const HEAD=0
const BODY=1

const iCheckboxColumn=0
const iCommentColumn=6

const tabbableSelector=`a[href]:not([tabindex="-1"]), input:not([tabindex="-1"]), button:not([tabindex="-1"]), [tabindex="0"]`
const commentSubItemSelector='.listened:not(.image.float)'

type KeyEvent = {
	key: string
	ctrlKey: boolean
	shiftKey: boolean
}

export type KeyResponse = {
	type: 'pass'
} | {
	type: 'stop'
} | {
	type: 'focus'
	far: boolean
	$item: HTMLElement
} | {
	type: 'check'
	far: boolean
	$item: HTMLElement
	$fromItem: HTMLElement
}

export default class KeyboardState {
	iSection: number
	iRow: number
	iColumn: number
	iSubItem: number|undefined
	constructor(
		private $table: HTMLTableElement
	) {
		this.iSection=Number($table.dataset.iKeyboardSection??'0')
		this.iRow    =Number($table.dataset.iKeyboardRow??'0')
		this.iColumn =Number($table.dataset.iKeyboardColumn??'0')
		if ($table.dataset.iKeyboardSubItem) {
			this.iSubItem=Number($table.dataset.iKeyboardSubItem)
		}
	}
	respondToKeyInHead(ev: KeyEvent): KeyResponse {
		const horKeyResponse=this.respondToHorizontalMovement(ev,true)
		if (horKeyResponse.type!='pass') {
			this.save()
		}
		return horKeyResponse
	}
	respondToKeyInBody(ev: KeyEvent, pager?: Pager): KeyResponse {
		const commentKeyResponse=this.respondToMovementInsideComment(ev)
		if (commentKeyResponse.type!='pass') {
			this.save()
			return commentKeyResponse
		}
		const horKeyResponse=this.respondToHorizontalMovement(ev,false)
		if (horKeyResponse.type!='pass') {
			this.save()
			return horKeyResponse
		}
		const verKeyResponse=this.respondToVerticalMovement(ev,pager)
		if (verKeyResponse.type!='pass') {
			this.save()
			return verKeyResponse
		}
		return {type:'pass'}
	}
	setToNearestVisible(): void {
		const getIndexOfNearestVisible=($currentElement:HTMLElement,$elementsIterable:Iterable<HTMLElement>):number=>{
			const $elements=[...$elementsIterable]
			const i=$elements.indexOf($currentElement)
			if (i<0) return 0
			for (let d=0;i-d>=0||i+d<$elements.length;d++) {
				if (i-d>=0 && !$elements[i-d].hidden) {
					return i-d
				}
				if (i+d<$elements.length && !$elements[i+d].hidden) {
					return i+d
				}
			}
			return 0
		}
		const $currentSection=this.getCurrentBodySection()
		if (!$currentSection) {
			this.iSection=0
			this.iRow=0
			this.iSubItem=undefined
		} else if ($currentSection.hidden) {
			this.iRow=0
			this.iSubItem=undefined
			this.iSection=getIndexOfNearestVisible($currentSection,this.$table.tBodies)
		} else {
			const $currentRow=this.getCurrentBodyRow()
			if (!$currentRow) {
				this.iRow=0
				this.iSubItem=undefined
			} else {
				const iRow2=getIndexOfNearestVisible($currentRow,$currentSection.rows)
				if (this.iRow!=iRow2) {
					this.iRow=iRow2
					this.iSubItem=undefined
				} else if (this.iColumn==iCommentColumn && this.iSubItem!=null) {
					const $subItems=$currentRow.querySelectorAll(`${selectors[BODY]} ${commentSubItemSelector}`)
					if (this.iSubItem<0 || this.iSubItem>=$subItems.length) {
						this.iSubItem=undefined
					}
				} else {
					this.iSubItem=undefined
				}
			}
		}
		this.save()
	}
	private respondToMovementInsideComment(ev: KeyEvent): KeyResponse {
		if (this.iColumn!=iCommentColumn) return {type:'pass'}
		const $item=this.getCurrentBodyItem()
		if (!$item) return {type:'pass'}
		const makeFocusResponse=($item:HTMLElement):KeyResponse=>({
			type: 'focus',
			$item,
			far: false
		})
		if (this.iSubItem==null) {
			if (ev.key=='Enter') {
				const $commentSubItem=$item.querySelector(commentSubItemSelector)
				if ($commentSubItem instanceof HTMLElement) {
					this.iSubItem=0
					return makeFocusResponse($commentSubItem)
				}
			}
		} else {
			if (ev.key=='Escape') {
				this.iSubItem=undefined
				return makeFocusResponse($item)
			}
			const $commentSubItems=$item.querySelectorAll(commentSubItemSelector)
			if (ev.key=='ArrowLeft' || ev.key=='ArrowUp') {
				if (this.iSubItem>0) {
					const $commentSubItem=$commentSubItems.item(this.iSubItem-1)
					if ($commentSubItem instanceof HTMLElement) {
						this.iSubItem--
						return makeFocusResponse($commentSubItem)
					}
				}
			} else if (ev.key=='ArrowRight' || ev.key=='ArrowDown') {
				if (this.iSubItem<$commentSubItems.length-1) {
					const $commentSubItem=$commentSubItems.item(this.iSubItem+1)
					if ($commentSubItem instanceof HTMLElement) {
						this.iSubItem++
						return makeFocusResponse($commentSubItem)
					}
				}
			}
		}
		return {type:'pass'}
	}
	private respondToHorizontalMovement(ev: KeyEvent, isInHead: boolean): KeyResponse {
		const updateState=():boolean=>{
			if (ev.key=='ArrowLeft') {
				if (this.iColumn>0) {
					this.iColumn--
					return true
				}
			} else if (ev.key=='ArrowRight') {
				if (this.iColumn<selectors.length-1) {
					this.iColumn++
					return true
				}
			} else if (ev.key=='Home' && !ev.ctrlKey) {
				this.iColumn=0
				return true
			} else if (ev.key=='End' && !ev.ctrlKey) {
				this.iColumn=selectors.length-1
				return true
			}
			return false
		}
		if (!updateState()) return {type:'pass'}
		this.iSubItem=undefined
		const $item = isInHead ? this.getCurrentHeadItem() : this.getCurrentBodyItem()
		if (!$item) return {type:'stop'}
		return {
			type: 'focus',
			$item,
			far: false
		}
	}
	private respondToVerticalMovement(ev: KeyEvent, pager?: Pager): KeyResponse {
		const setSectionAndRowIndices=($item: HTMLElement):boolean=>{
			const $row=$item.closest('tr')
			if (!$row) return false
			const $section=$row.parentElement
			if (!($section instanceof HTMLTableSectionElement)) return false
			const iRow=[...$section.rows].indexOf($row)
			if (iRow<0) return false
			const iSection=[...this.$table.tBodies].indexOf($section)
			if (iSection<0) return false
			this.iSubItem=undefined
			this.iRow=iRow
			this.iSection=iSection
			return true
		}
		const $currentItem=this.getCurrentBodyItem()
		if (!$currentItem) return {type:'pass'}
		const $items=htmlElementArray(this.$table.querySelectorAll(`tbody:not([hidden]) tr:not([hidden]) ${selectors[this.iColumn][BODY]}`))
		const i=$items.indexOf($currentItem)
		if (i<0) return {type:'pass'}
		let j: number|undefined
		if (ev.key=='ArrowUp') {
			if (i>0) j=i-1
		} else if (ev.key=='ArrowDown') {
			if (i<$items.length-1) j=i+1
		} else if (ev.key=='Home' && ev.ctrlKey) {
			j=0
		} else if (ev.key=='End' && ev.ctrlKey) {
			j=$items.length-1
		} else if (ev.key=='PageUp' && pager) {
			j=pager.goPageUp($items,i)
		} else if (ev.key=='PageDown' && pager) {
			j=pager.goPageDown($items,i)
		} else {
			return {type:'pass'}
		}
		const isSelection=ev.shiftKey&&this.iColumn==iCheckboxColumn
		const bailResponse: KeyResponse = ev.shiftKey ? {type:'stop'} : {type:'pass'}
		if (j!=null && i!=j) {
			const far=!(ev.key=='ArrowUp' || ev.key=='ArrowDown')
			const $fromItem=$items[i]
			const $item=$items[j]
			if (setSectionAndRowIndices($items[j])) {
				return {type: isSelection?'check':'focus', $fromItem, $item, far}
			}
		}
		return bailResponse
	}
	private getCurrentHeadItem(): HTMLElement|null {
		const $headSection=this.$table.tHead
		if (!$headSection) return null
		return $headSection.querySelector(selectors[this.iColumn][HEAD])
	}
	private getCurrentBodyItem(): HTMLElement|null {
		const selector=selectors[this.iColumn][BODY]
		const $section=this.$table.tBodies.item(this.iSection)
		if (!$section) return null
		const $row=$section.rows.item(this.iRow)
		return $row?.querySelector(selector) ?? $section.querySelector(selector)
	}
	private getCurrentBodySection(): HTMLTableSectionElement|null {
		return this.$table.tBodies.item(this.iSection)
	}
	private getCurrentBodyRow(): HTMLTableRowElement|null {
		const $section=this.getCurrentBodySection()
		if (!$section) return null
		return $section.rows.item(this.iRow)
	}
	private save(): void {
		this.$table.dataset.iKeyboardSection=String(this.iSection)
		this.$table.dataset.iKeyboardRow    =String(this.iRow)
		this.$table.dataset.iKeyboardColumn =String(this.iColumn)
		if (this.iSubItem!=null) {
			this.$table.dataset.iKeyboardSubItem=String(this.iSubItem)
		} else {
			delete this.$table.dataset.iKeyboardSubItem
		}
		for (const $e of this.$table.querySelectorAll(`:is(thead, tbody) :is(${tabbableSelector})`)) {
			if ($e instanceof HTMLElement) $e.tabIndex=-1
		}
		const $headItem=this.getCurrentHeadItem()
		if ($headItem) $headItem.tabIndex=0
		const $bodyItem=this.getCurrentBodyItem()
		if ($bodyItem) {
			if (this.iColumn==iCommentColumn && this.iSubItem!=null) {
				const $subItem=$bodyItem.querySelectorAll(commentSubItemSelector).item(this.iSubItem)
				if ($subItem instanceof HTMLElement) $subItem.tabIndex=0
			} else {
				$bodyItem.tabIndex=0
			}
		}
	}
}

const htmlElementArray=($eIterable: Iterable<Element>): HTMLElement[]=>{
	const $es: HTMLElement[] = []
	for (const $e of $eIterable) {
		if ($e instanceof HTMLElement) $es.push($e)
	}
	return $es
}
