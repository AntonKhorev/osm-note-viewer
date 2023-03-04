import Pager from './pager'
import type {KeyResponse} from './cursor-state'
import CursorState from './cursor-state'
import makeHelpDialog from '../help-dialog'
import {makeElement} from '../html'
import {ul,li,p,kbd} from '../html-shortcuts'

export default class Cursor {
	$helpDialog=makeHelpDialog(`Close note table help`,[
		makeElement('h2')()(`Note table keyboard controls`),
		p(`Inside the table head:`),
		ul(
			li(kbd(`Left`),` / `,kbd(`Right`),` — go to adjacent table controls`),
			li(kbd(`Home`),` / `,kbd(`End`),` — go to first/last control`),
			li(kbd(`Tab`),` — go to table body`),
		),
		p(`Inside the table body:`),
		ul(
			li(kbd(`Arrow keys`),` — go to adjacent table cell`),
			li(kbd(`Home`),` / `,kbd(`End`),` — go to first/last column`),
			li(kbd(`Ctrl`),` + `,kbd(`Home`),` / `,kbd(`End`),` — go to first/last row`),
			li(kbd(`PageUp`),` / `,kbd(`PageDown`),` — go approximately one viewport up/down`),
			li(kbd(`Shift`),` + any vertical navigation keys while in the checkbox column — select notes`),
			li(kbd(`Ctrl`),` + `,kbd(`A`),` — select all notes`),
			li(kbd(`Enter`),` while in comment column — go inside the comment cell`),
			li(kbd(`Esc`),` while inside a comment cell — exit the cell`),
			li(kbd(`Shift`),` + `,kbd(`Tab`),` — go to table head`),
		),
	])
	private state: CursorState
	constructor(
		$table: HTMLTableElement,
		checkRange: ($fromSection:HTMLTableSectionElement,$toSection:HTMLTableSectionElement)=>void
	) {
		this.state=new CursorState($table)
		$table.addEventListener('keydown',ev=>{
			if (ev.key=='F1') {
				this.$helpDialog.showModal()
			} else {
				noteTableKeydownListener($table,ev,checkRange,this.state)
			}
		})
		$table.addEventListener('click',ev=>{
			const $e=ev.target
			if (!($e instanceof HTMLElement)) return
			const $focusElement=this.state.setToClicked($e)
			$focusElement?.focus()
		},true)
		// TODO focusout event to reset range selection state
	}
	reset($table: HTMLTableElement) {
		this.state=new CursorState($table)
	}
	updateTabIndex() {
		this.state.setToNearestVisible()
	}
}

function noteTableKeydownListener(
	$table: HTMLTableElement,
	ev: KeyboardEvent,
	checkRange: ($fromSection:HTMLTableSectionElement,$toSection:HTMLTableSectionElement)=>void,
	state: CursorState
): void {
	if (ev.ctrlKey && ev.key.toLowerCase()=='a') {
		const $allCheckbox=$table.querySelector('thead .note-checkbox input')
		if (!($allCheckbox instanceof HTMLInputElement)) return
		$allCheckbox.click()
		ev.stopPropagation()
		ev.preventDefault()
		return
	}
	if (!(ev.target instanceof HTMLElement)) return
	const $section=ev.target.closest('thead, tbody')
	if (!($section instanceof HTMLTableSectionElement)) return
	let keyResponse: KeyResponse
	if ($section.tagName=='THEAD') {
		keyResponse=state.respondToKeyInHead(ev)
	} else {
		let pager: Pager|undefined
		const $scrollingPart=$table.closest('.scrolling') // TODO pass
		if ($scrollingPart) pager=new Pager($scrollingPart)
		keyResponse=state.respondToKeyInBody(ev,pager)
		
	}
	if (keyResponse?.check) {
		checkRange(
			keyResponse.check.$fromSection,
			keyResponse.check.$toSection
		)
	}
	if (keyResponse?.focus) {
		focus(keyResponse.focus.$item,keyResponse.focus.far)
	}
	if (keyResponse?.stop) {
		ev.stopPropagation()
		ev.preventDefault()
	}
}

function focus($e: HTMLElement, far: boolean): void {
	if (far) {
		$e.focus({preventScroll:true})
		$e.scrollIntoView({block:'nearest',behavior:'smooth'}) // TODO delay map autozoom to notes on screen in table
	} else {
		$e.focus()
		$e.scrollIntoView({block:'nearest'})
	}
}
