import Pager from './pager'
import type {KeyResponse} from './cursor-state'
import CursorState from './cursor-state'
import makeHelpDialog from '../help-dialog'
import {makeElement} from '../util/html'
import {ul,li,p,kbd} from '../util/html-shortcuts'

export default class Cursor {
	$helpDialog=makeHelpDialog(`Close note table help`,[
		makeElement('h2')()(`Note table controls`),
		ul(
			li(kbd(`Tab`),` and `,kbd(`Shift`),` + `,kbd(`Tab`),` — switch between table head and body`),
		),
		p(`Anywhere inside the table:`),
		ul(
			li(kbd(`Arrow keys`),` — go to adjacent table cell`),
			li(kbd(`Home`),` / `,kbd(`End`),` — go to first/last column`),
			li(kbd(`Ctrl`),` + `,kbd(`A`),` — select all notes`),
		),
		p(`Inside the table body:`),
		ul(
			li(kbd(`Ctrl`),` + `,kbd(`Home`),` / `,kbd(`End`),` — go to first/last row`),
			li(kbd(`Shift`),` + left click on a checkbox — select a range of notes starting from the previous click`),
			li(kbd(`Shift`),` + any vertical navigation keys — select notes`),
			li(kbd(`Enter`),` while in the comment column — go inside the comment cell`),
			li(kbd(`Esc`),` while inside a comment cell — exit the cell`),
			li(kbd(`Enter`),` while in the map column — switch to the map and zoom to note`),
			li(kbd(`Esc`),` while switched to the map — switch back to the note table`),
		),
	])
	private state: CursorState
	constructor(
		$table: HTMLTableElement,
		selectSections: (select: [iSection:number,selected:boolean][])=>void
	) {
		this.state=new CursorState($table)
		$table.addEventListener('keydown',ev=>{
			if (ev.key=='F1') {
				this.$helpDialog.showModal()
			} else {
				noteTableKeydownListener($table,ev,selectSections,this.state)
			}
		})
		$table.addEventListener('click',ev=>{
			const $e=ev.target
			if (!($e instanceof Element)) return
			const $focusElement=this.state.setToClicked($e)
			$focusElement?.focus()
		},true)
		$table.addEventListener('focusout',ev=>{
			const $e=ev.relatedTarget
			if (
				!($e instanceof Element)
				|| !$table.contains($e)
			) {
				this.state.loseFocus()
			}
		})
	}
	reset($table: HTMLTableElement) {
		this.state=new CursorState($table)
	}
	updateTabIndex() {
		this.state.setToNearestVisible()
	}
	focus() {
		const $e=this.state.getCurrentBodyItem()
		$e?.focus()
	}
}

function noteTableKeydownListener(
	$table: HTMLTableElement,
	ev: KeyboardEvent,
	selectSections: (select: [iSection:number,selected:boolean][])=>void,
	state: CursorState
): void {
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
	if (keyResponse?.select) {
		selectSections(keyResponse.select)
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
