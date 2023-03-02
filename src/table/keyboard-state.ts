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

type KeyEvent = {
	key: string
	ctrlKey: boolean
}

type KeyFocusResponse = 'nearFocus' | 'farFocus'
type KeyResponse = 'none' | KeyFocusResponse

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
	respondToKeyInHead(ev: KeyEvent): boolean {
		const horKeyResponse=this.respondToHorizontalMovementKey(ev)
		if (horKeyResponse!='none') {
			const $item=this.getCurrentHeadItem()
			if ($item) this.focus($item,horKeyResponse)
			return true
		}
		return false
	}
	respondToKeyInBody(ev: KeyEvent): boolean {
		const horKeyResponse=this.respondToHorizontalMovementKey(ev)
		if (horKeyResponse!='none') {
			const $item=this.getCurrentBodyItem()
			if ($item) this.focus($item,horKeyResponse)
			return true
		}
		const verKeyResponse=this.respondToVerticalMovementKey(ev)
		if (verKeyResponse!='none') {
			const $item=this.getCurrentBodyItem()
			if ($item) this.focus($item,verKeyResponse)
			return true
		}
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
	private respondToHorizontalMovementKey(ev: KeyEvent): KeyResponse {
		if (ev.key=='ArrowLeft') {
			if (this.iColumn>0) {
				this.iColumn--
				return 'nearFocus'
			}
		} else if (ev.key=='ArrowRight') {
			if (this.iColumn<selectors.length-1) {
				this.iColumn++
				return 'nearFocus'
			}
		} else if (ev.key=='Home' && !ev.ctrlKey) {
			this.iColumn=0
			return 'nearFocus'
		} else if (ev.key=='End' && !ev.ctrlKey) {
			this.iColumn=selectors.length-1
			return 'nearFocus'
		}
		return 'none'
	}
	private respondToVerticalMovementKey(ev: KeyEvent): KeyResponse {
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
		const move=<T>(
			getNextIndex: (i:number)=>number,
			$currentItem: T|null,
			$itemsIterable: Iterable<T>,
			isVisible: ($item:HTMLElement)=>boolean,
			setSectionAndRowIndices: ($item:T)=>boolean
		):KeyResponse=>{
			if (!$currentItem) return 'none'
			const $items=[...$itemsIterable]
			let i=$items.indexOf($currentItem)
			if (i<0) return 'none'
			for (i=getNextIndex(i);i>=0&&i<$items.length;i=getNextIndex(i)) {
				const $item=$items[i]
				if ($item instanceof HTMLElement && isVisible($item)) {
					return setSectionAndRowIndices($item) ? 'nearFocus' : 'none'
				}
			}
			return 'none'
		}
		const moveByRow=(
			getNextIndex: (i:number)=>number
		):KeyResponse=>{
			return move(
				getNextIndex,
				this.getCurrentBodyRow(),
				this.$table.querySelectorAll('tbody tr'),
				$row=>!$row.hidden && !$row.parentElement?.hidden,
				setSectionAndRowIndicesFromRow
			)
		}
		const moveBySection=(
			getNextIndex: (i:number)=>number
		):KeyResponse=>{
			return move(
				getNextIndex,
				this.getCurrentBodySection(),
				this.$table.tBodies,
				$section=>!$section.hidden,
				setSectionAndRowIndicesFromSection
			)
		}
		if (ev.key=='ArrowUp') {
			if (selectors[this.iColumn][SPAN]) {
				return moveBySection(i=>i-1)
			} else {
				return moveByRow(i=>i-1)
			}
		} else if (ev.key=='ArrowDown') {
			if (selectors[this.iColumn][SPAN]) {
				return moveBySection(i=>i+1)
			} else {
				return moveByRow(i=>i+1)
			}
		} else if (ev.key=='Home' && ev.ctrlKey) {
			this.iSection=0
			this.iRow=0
			this.setToNearestVisible()
			return 'farFocus'
		} else if (ev.key=='End' && ev.ctrlKey) {
			this.iSection=this.$table.tBodies.length-1
			if (selectors[this.iColumn][SPAN]) {
				this.iRow=0
			} else {
				const $section=this.getCurrentBodySection()
				this.iRow=$section?$section.rows.length-1:0
			}
			this.setToNearestVisible()
			return 'farFocus'
		}
		return 'none'
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
	private focus($e: HTMLElement, response: KeyFocusResponse): void {
		if (response=='farFocus') {
			$e.focus({preventScroll:true})
			$e.scrollIntoView({block:'nearest',behavior:'smooth'}) // TODO delay map autozoom to notes on screen in table
		} else {
			$e.focus()
			$e.scrollIntoView({block:'nearest'})
		}
	}
}
