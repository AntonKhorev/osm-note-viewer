import type Pager from './pager'

const columnData: [cellClass:string, headSelector:string, bodySelector:string][] = [
	['note-checkbox','input','input'],
	['note-link','button','a'],
	['note-comments-count','button','button'],
	['note-date','button','time'],
	['note-user','button','a'],
	['note-action','','[class|=icon]'],
	['note-comment','button',''],
	['note-map','button','a'],
]
const nColumns=columnData.length
function getSelector(cellClass: string, subSelector: string): string {
	let selector='.'+cellClass
	if (subSelector) selector+=' '+subSelector
	return selector
}
function getCellSelector(i: number): string {
	const [cellClass]=columnData[i]
	return '.'+cellClass
}
function getHeadSelector(i: number): string {
	const [cellClass,subSelector]=columnData[i]
	return getSelector(cellClass,subSelector)
}
function getBodySelector(i: number): string {
	const [cellClass,,subSelector]=columnData[i]
	return getSelector(cellClass,subSelector)
}
const iCheckboxColumn=0
const iCommentColumn=6

const focusableSelector=`a[href], input, button, [tabindex]`
const tabbableSelector=`:is(${focusableSelector}):not([tabindex="-1"])`
const commentSubItemSelector='.listened:not(.image.float)'

type KeyEvent = {
	key: string
	ctrlKey: boolean
	shiftKey: boolean
}

export type KeyResponse = {
	stop?: boolean
	focus?: {
		$item: HTMLElement
		far: boolean
	}
	select?: {
		selected: boolean,
		$fromSection: HTMLTableSectionElement
		$toSection: HTMLTableSectionElement
	}
} | null

// type Select = {
// 	iStartRow: number
// 	selected: boolean
// }

export default class CursorState {
	private iSection=0
	private iRow=0
	private iColumn=0
	private iSubItem: number|undefined
	// private select: Select|undefined
	private isSelection: boolean|undefined
	constructor(
		private $table: HTMLTableElement
	) {}
	respondToKeyInHead(ev: KeyEvent): KeyResponse {
		const keyResponse =
			this.respondToAllSelection(ev) ??
			this.respondToHorizontalMovement(ev,true)
		if (keyResponse) this.save()
		return keyResponse
	}
	respondToKeyInBody(ev: KeyEvent, pager?: Pager): KeyResponse {
		const keyResponse =
			this.respondToAllSelection(ev) ??
			this.respondToMovementInsideComment(ev) ??
			this.respondToHorizontalMovement(ev,false) ??
			this.respondToVerticalMovement(ev,pager)
		if (keyResponse) this.save()
		return keyResponse
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
					const $subItems=$currentRow.querySelectorAll(`${getBodySelector(iCommentColumn)} ${commentSubItemSelector}`)
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
	resetSelect(): void {
		// this.select=undefined
		this.isSelection=undefined
	}
	/**
	 * @returns element to focus if required
	 */
	setToClicked($target: HTMLElement): HTMLElement|undefined {
		const $cell=$target.closest('td, th')
		if (!($cell instanceof HTMLTableCellElement)) return
		const $row=$cell.parentElement
		if (!($row instanceof HTMLTableRowElement)) return
		const $section=$row.parentElement
		if (!($section instanceof HTMLTableSectionElement)) return
		for (let i=0;i<nColumns;i++) {
			if (!$cell.matches(getCellSelector(i))) continue
			this.iColumn=i
			if ($section.tagName=='THEAD') {
				const [$focusElement,]=this.save()
				if ($focusElement && $focusElement!=$target.closest(focusableSelector)) {
					return $focusElement
				}
			} else {
				const iSection=[...this.$table.tBodies].indexOf($section)
				if (iSection<0) return
				this.iSection=iSection
				const iRow=[...$section.rows].indexOf($row)
				if (iRow<0) return
				this.iRow=iRow
				this.iSubItem=undefined
				if (this.iColumn==iCommentColumn) {
					const $bodySubItem=$target.closest(commentSubItemSelector)
					if ($bodySubItem instanceof HTMLElement) {
						const iSubItem=[...$cell.querySelectorAll(commentSubItemSelector)].indexOf($bodySubItem)
						if (iSubItem>=0) {
							this.iSubItem=iSubItem
						}
					}
				}
				const [,$focusElement]=this.save()
				if ($focusElement && $focusElement!=$target.closest(focusableSelector)) {
					return $focusElement
				}
			}
		}
	}
	private respondToAllSelection(ev: KeyEvent): KeyResponse {
		if (ev.ctrlKey && ev.key.toLowerCase()=='a') {
			const $allCheckbox=this.$table.querySelector('thead .note-checkbox input')
			if (!($allCheckbox instanceof HTMLInputElement)) return null
			const $sections=this.$table.querySelectorAll(`tbody:not([hidden])`)
			if ($sections.length==0) return {stop:true}
			const $fromSection=$sections.item(0)
			const $toSection=$sections.item($sections.length-1)
			if (
				$fromSection instanceof HTMLTableSectionElement &&
				$toSection instanceof HTMLTableSectionElement
			) {
				return {
					select: {
						selected: !$allCheckbox.checked,
						$fromSection, $toSection
					},
					stop: true
				}
			}
			return {stop:true}
		}
		return null
	}
	private respondToMovementInsideComment(ev: KeyEvent): KeyResponse {
		if (this.iColumn!=iCommentColumn) return null
		const $item=this.getCurrentBodyItem()
		if (!$item) return null
		const makeFocusResponse=($item:HTMLElement):KeyResponse=>({
			focus: {
				$item,
				far: false
			},
			stop: true
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
		return null
	}
	private respondToHorizontalMovement(ev: KeyEvent, isInHead: boolean): KeyResponse {
		const updateState=():boolean=>{
			if (ev.key=='ArrowLeft') {
				if (this.iColumn>0) {
					this.iColumn--
					return true
				}
			} else if (ev.key=='ArrowRight') {
				if (this.iColumn<nColumns-1) {
					this.iColumn++
					return true
				}
			} else if (ev.key=='Home' && !ev.ctrlKey) {
				this.iColumn=0
				return true
			} else if (ev.key=='End' && !ev.ctrlKey) {
				this.iColumn=nColumns-1
				return true
			}
			return false
		}
		if (!updateState()) return null
		this.iSubItem=undefined
		const $item = isInHead ? this.getCurrentHeadItem() : this.getCurrentBodyItem()
		if (!$item) return {stop:true}
		return {
			focus: {
				$item,
				far: false
			},
			stop: true
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
		if (!$currentItem) return null
		const $items=htmlElementArray(this.$table.querySelectorAll(`tbody:not([hidden]) tr:not([hidden]) ${getBodySelector(this.iColumn)}`))
		const i=$items.indexOf($currentItem)
		if (i<0) return null
		let j: number|undefined
		let d: number
		if (ev.key=='ArrowUp') {
			d=-1
			j=Math.max(0,i-1)
		} else if (ev.key=='ArrowDown') {
			d=+1
			j=Math.min($items.length-1,i+1)
		} else if (ev.key=='Home' && ev.ctrlKey) {
			d=-1
			j=0
		} else if (ev.key=='End' && ev.ctrlKey) {
			d=+1
			j=$items.length-1
		} else if (ev.key=='PageUp' && pager) {
			d=-1
			j=pager.goPageUp($items,i)
		} else if (ev.key=='PageDown' && pager) {
			d=+1
			j=pager.goPageDown($items,i)
		} else {
			return null
		}
		const bailResponse: KeyResponse = ev.shiftKey ? {stop:true} : null
		if (j==null) return bailResponse
		if (ev.shiftKey) {
			if (this.iColumn!=iCheckboxColumn) return bailResponse
			const $fromSection=$items[i].closest('tbody')
			if (this.isSelection==null) {
				const $startingCheckbox=$fromSection?.querySelector(getBodySelector(iCheckboxColumn))
				const startingChecked=($startingCheckbox instanceof HTMLInputElement) && $startingCheckbox.checked
				this.isSelection=!startingChecked
			}
			const $toSection=$items[i==j || $items.length==0 ? j : j-d].closest('tbody')
			const far=!(ev.key=='ArrowUp' || ev.key=='ArrowDown')
			if (setSectionAndRowIndices($items[j])) {
				const response:KeyResponse={stop: true}
				if (i!=j) response.focus={
					$item: $items[j],
					far
				}
				if ($fromSection && $toSection) response.select={
					selected: this.isSelection,
					$fromSection,
					$toSection
				}
				return response
			}
			return bailResponse
		} else {
			if (i==j) return bailResponse
			const far=!(ev.key=='ArrowUp' || ev.key=='ArrowDown')
			if (setSectionAndRowIndices($items[j])) return {
				focus: {
					$item: $items[j],
					far
				},
				stop: true
			}
			return bailResponse
		}
	}
	private getCurrentHeadItem(): HTMLElement|null {
		const $headSection=this.$table.tHead
		if (!$headSection) return null
		return $headSection.querySelector(getHeadSelector(this.iColumn))
	}
	private getCurrentBodyItem(): HTMLElement|null {
		const selector=getBodySelector(this.iColumn)
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
	private save(): [
		$headTabIndexRecipient:HTMLElement|null,
		$bodyTabIndexRecipient:HTMLElement|null
	] {
		for (const $e of this.$table.querySelectorAll(`:is(thead, tbody) ${tabbableSelector}`)) {
			if ($e instanceof HTMLElement) $e.tabIndex=-1
		}
		const $headRecipient=this.getCurrentHeadItem()
		let $bodyRecipient=this.getCurrentBodyItem()
		if ($bodyRecipient && this.iColumn==iCommentColumn && this.iSubItem!=null) {
			const $bodySubItem=$bodyRecipient.querySelectorAll(commentSubItemSelector).item(this.iSubItem)
			if ($bodySubItem instanceof HTMLElement) $bodyRecipient=$bodySubItem
		}
		if ($headRecipient) $headRecipient.tabIndex=0
		if ($bodyRecipient) $bodyRecipient.tabIndex=0
		return [$headRecipient,$bodyRecipient]
	}
}

const htmlElementArray=($eIterable: Iterable<Element>): HTMLElement[]=>{
	const $es: HTMLElement[] = []
	for (const $e of $eIterable) {
		if ($e instanceof HTMLElement) $es.push($e)
	}
	return $es
}
