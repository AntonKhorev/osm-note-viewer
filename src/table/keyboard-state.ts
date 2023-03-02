const selectors: [spans:boolean,headSelector:string,bodySelector:string][] = [
	[true,'.note-checkbox input','.note-checkbox input'],
	[true,'.note-link button','.note-link a'],
	[true,'.note-comments-count button','.note-comments-count button'],
	[false,'.note-date button','.note-date time'],
	[false,'.note-user button','.note-user a'],
	[false,'.note-action','.note-action [class|=icon]'],
	[false,'.note-comment button','.note-comment'],
	[true,'.note-map button','.note-map a'],
]
const SPAN=0
const HEAD=1
const BODY=2

const tabbableSelector=`a[href]:not([tabindex="-1"]), input:not([tabindex="-1"]), button:not([tabindex="-1"]), [tabindex="0"]`

export default class KeyboardState {
	iSection: number
	iRow: number
	iColumn: number
	constructor(
		private $table: HTMLTableElement
	) {
		this.iSection=Number($table.dataset.iKeyboardSection??'0')
		this.iRow=    Number($table.dataset.iKeyboardRow??'0')
		this.iColumn= Number($table.dataset.iKeyboardColumn??'0')
	}
	save(): void {
		this.$table.dataset.iKeyboardSection=String(this.iSection)
		this.$table.dataset.iKeyboardRow    =String(this.iRow)
		this.$table.dataset.iKeyboardColumn =String(this.iColumn)
	}
	updateTabIndices(): void {
		for (const $e of this.$table.querySelectorAll(`:is(thead, tbody) :is(${tabbableSelector})`)) {
			if ($e instanceof HTMLElement) $e.tabIndex=-1
		}
		const $headItem=this.getCurrentHeadItem()
		if ($headItem) $headItem.tabIndex=0
		const $bodyItem=this.getCurrentBodyItem()
		if ($bodyItem) $bodyItem.tabIndex=0
	}
	focusInHead(): void {
		const $item=this.getCurrentHeadItem()
		$item?.focus()
	}
	focusInBody(): void {
		const $item=this.getCurrentBodyItem()
		$item?.focus()
	}
	respondToKeyInHead(key: string): boolean {
		return this.respondToHorizontalMovementKey(key)
	}
	respondToKeyInBody(key: string): boolean {
		if (this.respondToHorizontalMovementKey(key)) return true
		if (this.respondToVerticalMovementKey(key)) return true
		return false
	}
	setToNearestVisible(): void {
		const $currentSection=this.getCurrentBodySection()
		if (!$currentSection) {
			this.iSection=0
			this.iRow=0
			return
		}
		const getIndexOfNearestVisible=($currentElement:HTMLElement,$elementsIterable:Iterable<HTMLElement>):number=>{
			const $elements=[...$elementsIterable]
			const i=$elements.indexOf($currentElement)
			if (i<0) return 0
			for (let d=1;i-d>=0||i+d<$elements.length;d++) {
				if (i-d>=0 && !$elements[i-d].hidden) {
					return i-d
				}
				if (i+d<$elements.length && !$elements[i+d].hidden) {
					return i+d
				}
			}
			return 0
		}
		if ($currentSection.hidden) {
			this.iRow=0
			this.iSection=getIndexOfNearestVisible($currentSection,this.$table.tBodies)
		} else {
			const $currentRow=this.getCurrentBodyRow()
			if (!$currentRow) {
				this.iRow=0
			} else {
				this.iRow=getIndexOfNearestVisible($currentRow,$currentSection.rows)
			}
		}
	}
	private respondToHorizontalMovementKey(key: string): boolean {
		if (key=='ArrowLeft') {
			if (this.iColumn>0) {
				this.iColumn--
				return true
			}
		} else if (key=='ArrowRight') {
			if (this.iColumn<selectors.length-1) {
				this.iColumn++
				return true
			}
		} else if (key=='Home') {
			this.iColumn=0
			return true
		} else if (key=='End') {
			this.iColumn=selectors.length-1
			return true
		}
		return false
	}
	private respondToVerticalMovementKey(key: string): boolean {
		const setSectionAndRowIndicesFromRow=($row:HTMLTableRowElement):boolean=>{
			const $section=$row.parentElement
			if (!($section instanceof HTMLTableSectionElement)) return false
			const iRow=[...$section.rows].indexOf($row)
			if (iRow<0) return false
			const iSection=[...this.$table.tBodies].indexOf($section)
			if (iSection<0) return false
			this.iRow=iRow
			this.iSection=iSection
			return true
		}
		const setSectionAndRowIndicesFromSection=($section:HTMLTableSectionElement):boolean=>{
			const iSection=[...this.$table.tBodies].indexOf($section)
			if (iSection<0) return false
			this.iRow=0
			this.iSection=iSection
			return true
		}
		const moveByRow=(
			getNextIndex: (i:number)=>number
		):boolean=>{
			const $currentRow=this.getCurrentBodyRow()
			if (!$currentRow) return false
			const $rows=[...this.$table.querySelectorAll('tbody tr')]
			let i=$rows.indexOf($currentRow)
			if (i<0) return false
			for (i=getNextIndex(i);i>=0&&i<$rows.length;i=getNextIndex(i)) {
				const $row=$rows[i]
				if ($row instanceof HTMLTableRowElement && !$row.hidden && !$row.parentElement?.hidden) {
					return setSectionAndRowIndicesFromRow($row)
				}
			}
			return false
		}
		const moveBySection=(
			getNextIndex: (i:number)=>number
		):boolean=>{
			const $currentSection=this.getCurrentBodySection()
			if (!$currentSection) return false
			const $sections=[...this.$table.tBodies]
			let i=$sections.indexOf($currentSection)
			if (i<0) return false
			for (i=getNextIndex(i);i>=0&&i<$sections.length;i=getNextIndex(i)) {
				const $section=$sections[i]
				if ($section instanceof HTMLTableSectionElement && !$section.hidden) {
					return setSectionAndRowIndicesFromSection($section)
				}
			}
			return false
		}
		if (key=='ArrowUp') {
			if (selectors[this.iColumn][SPAN]) {
				return moveBySection(i=>i-1)
			} else {
				return moveByRow(i=>i-1)
			}
		} else if (key=='ArrowDown') {
			if (selectors[this.iColumn][SPAN]) {
				return moveBySection(i=>i+1)
			} else {
				return moveByRow(i=>i+1)
			}
		}
		return false
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
}
