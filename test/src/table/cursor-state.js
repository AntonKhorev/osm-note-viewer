import {strict as assert} from 'assert'
import {JSDOM} from 'jsdom'

import CursorState from '../../../test-build/table/cursor-state.js'

const globalProperties=[
	'HTMLElement',
	'HTMLInputElement',
	'HTMLTableSectionElement',
	'HTMLTableRowElement',
	'HTMLTableCellElement',
]

describe("NoteTable / CursorState",()=>{
	beforeEach(function(){
		const jsdom=new JSDOM()
		this.window=jsdom.window
		for (const property of globalProperties) {
			global[property]=jsdom.window[property]
		}
	})
	afterEach(function(){
		for (const property of globalProperties) {
			delete global[property]
		}
	})
	it("passes when moving outside of table",function(){
		const $table=makeTable(this.window.document,[1,1])
		const cursorState=new CursorState($table)
		assert.deepEqual(
			cursorState.respondToKeyInBody({key:'ArrowUp'}),
			null
		)
	})
	it("moves cursor in head",function(){
		const $table=makeTable(this.window.document,[1])
		const cursorState=new CursorState($table)
		assert.deepEqual(cursorState.respondToKeyInHead({key:'ArrowRight'}),{
			focus: {
				$item: $table.tHead.querySelector('.note-link button'),
				far: false,
			},
			stop: true
		})
	})
	it("selects all from head",function(){
		const $table=makeTable(this.window.document,[1,1,1,1])
		const cursorState=new CursorState($table)
		assert.deepEqual(
			cursorState.respondToKeyInHead({key:'A',ctrlKey:true}),
			makeSelectFocusResponse($table,[+0,+1,+2,+3])
		)
	})
	it("selects all from body",function(){
		const $table=makeTable(this.window.document,[1,1,1,1])
		const cursorState=new CursorState($table)
		assert.deepEqual(
			cursorState.respondToKeyInBody({key:'A',ctrlKey:true}),
			makeSelectFocusResponse($table,[+0,+1,+2,+3])
		)
	})
	it("selects with shift+down",function(){
		const $table=makeTable(this.window.document,[1,2,3,1])
		const cursorState=new CursorState($table)
		assertShiftSelection(cursorState,'ArrowDown',$table,+0,1)
		assertShiftSelection(cursorState,'ArrowDown',$table,+1,2)
		assertShiftSelection(cursorState,'ArrowDown',$table,+2,3)
	})
	it("deselects with shift+down",function(){
		const $table=makeTable(this.window.document,[1,2,3,1])
		for (const $checkbox of $table.querySelectorAll('.note-checkbox input')) {
			$checkbox.checked=true
		}
		const cursorState=new CursorState($table)
		assertShiftSelection(cursorState,'ArrowDown',$table,-0,1)
		assertShiftSelection(cursorState,'ArrowDown',$table,-1,2)
		assertShiftSelection(cursorState,'ArrowDown',$table,-2,3)
	})
	it("selects with shift+up",function(){
		const $table=makeTable(this.window.document,[1,2,3,1])
		const cursorState=new CursorState($table)
		assert.deepEqual(
			cursorState.respondToKeyInBody({key:'End',ctrlKey:true}),
			{
				focus: {$item:$table.tBodies[3].querySelector('.note-checkbox input'),far:true},
				stop: true
			}
		)
		assertShiftSelection(cursorState,'ArrowUp',$table,+3,2)
		assertShiftSelection(cursorState,'ArrowUp',$table,+2,1)
		assertShiftSelection(cursorState,'ArrowUp',$table,+1,0)
	})
	it("selects with shift+down over partially selected",function(){
		const $table=makeTable(this.window.document,[1,2,3,1])
		$table.tBodies[1].querySelector('.note-checkbox input').checked=true
		const cursorState=new CursorState($table)
		assertShiftSelection(cursorState,'ArrowDown',$table,+0,1)
		assertShiftSelection(cursorState,'ArrowDown',$table,+1,2)
	})
	it("selects with shift+up against the first row",function(){
		const $table=makeTable(this.window.document,[1,2,3,1])
		const cursorState=new CursorState($table)
		assertShiftSelection(cursorState,'ArrowUp',$table,+0)
	})
	it("selects with shift+pagedown",function(){
		const pager=makePager(3)
		const $table=makeTable(this.window.document,[1,1,1,1,1,1])
		const cursorState=new CursorState($table)
		assertShiftSelection(cursorState,['PageDown',pager],$table,[+0,+1,+2],3,true)
	})
	it("selects with shift+down then deselects with shift+up",function(){
		const $table=makeTable(this.window.document,[1,2,3,1])
		const cursorState=new CursorState($table)
		assertShiftSelection(cursorState,'ArrowDown',$table,+0,1)
		assertShiftSelection(cursorState,'ArrowUp',$table,-0,0)
	})
	it("selects with shift+down then selects with shift+pageup",function(){
		const pager=makePager(3)
		const $table=makeTable(this.window.document,[1,1,1,1,1,1])
		const cursorState=new CursorState($table)
		cursorState.respondToKeyInBody({key:'PageDown'},pager)
		assertShiftSelection(cursorState,'ArrowDown',$table,+3,4)
		assertShiftSelection(cursorState,['PageUp',pager],$table,[+3,+2],1,true)
	})
	it("selects with shift+down then selects+deselects with shift+pageup",function(){
		const pager=makePager(3)
		const $table=makeTable(this.window.document,[1,1,1,1,1,1])
		const cursorState=new CursorState($table)
		cursorState.respondToKeyInBody({key:'PageDown'},pager)
		assertShiftSelection(cursorState,'ArrowDown',$table,+3,4)
		assertShiftSelection(cursorState,'ArrowDown',$table,+4,5)
		assertShiftSelection(cursorState,['PageUp',pager],$table,[-4,+3],2,true)
	})
	for (const [interruptionTitle,interrupt] of [
		[`lose focus`,($table,cursorState)=>cursorState.loseFocus()],
		[`click`,($table,cursorState)=>cursorState.setToClicked($table.tBodies[1].querySelector('.note-checkbox'))]
	]) {
		it(`selects and deselects with shift+down over partially selected and ${interruptionTitle} interruption`,function(){
			const $table=makeTable(this.window.document,[1,2,3,1])
			$table.tBodies[1].querySelector('.note-checkbox input').checked=true
			const cursorState=new CursorState($table)
			assertShiftSelection(cursorState,'ArrowDown',$table,+0,1)
			interrupt($table,cursorState)
			assertShiftSelection(cursorState,'ArrowDown',$table,-1,2)
		})
	}
})

function makeTable(document,nOfCommentsPerNote) {
	const $table=document.createElement('table')
	{
		const $section=$table.createTHead()
		const $row=$section.insertRow()
		$row.innerHTML=`
			<th class="note-checkbox"><input type="checkbox">
			<th class="note-link">id <button>+</button>
			<th class="note-comments-count"><button>+</button>
			<th class="note-date">date <button>+</button>
			<th class="note-user">user <button>+</button>
			<th class="note-action">
			<th class="note-comment">comment <button>+</button>
			<th class="note-map"><button>+</button>
		`
	}
	for (let i=0;i<nOfCommentsPerNote.length;i++) {
		const $section=$table.createTBody()
		const nComments=nOfCommentsPerNote[i]
		const span = nComments>1 ? ` rowspan="${nComments}"` : ``
		for (let j=0;j<nComments;j++) {
			const $row=$section.insertRow()
			const commentHtml=`
				<td class="note-date"><time tabindex="0">2023-03-03</time>
				<td class="note-user"><a href=#>TheUser</a>
				<td class="note-action"><span class="icon-status-open" tabindex="0">!</span>
				<td class="note-comment">note ${i} comment ${j}
			`
			$row.innerHTML = j==0 ? `
				<td class="note-checkbox"${span}><input type="checkbox">
				<td class="note-link"${span}><a href=#>${100500+i}</a>
				<td class="note-comments-count"${span}><button>+</button>
				${commentHtml}
				<td class="note-map"${span}><a href=#>M</a>
			` : commentHtml
		}
	}
	document.body.append($table)
	return $table
}

function assertShiftSelection(cursorState,keyAndPager,$table,iSelect,iFocus,focusFar) {
	let key=keyAndPager
	let pager=undefined
	if (Array.isArray(keyAndPager)) [key,pager]=keyAndPager
	const response=cursorState.respondToKeyInBody({key,shiftKey:true},pager)
	const expectedResponse=makeSelectFocusResponse($table,iSelect,iFocus,focusFar)
	assert.deepEqual(response,expectedResponse)
	if (iFocus!=null) assert.equal(response.focus.$item,expectedResponse.focus.$item)
	for (const [iSection,selected] of response.select) {
		$table.tBodies[iSection].querySelector('.note-checkbox input').checked=selected
	}
}

function makeSelectFocusResponse($table,iSelect,iFocus,focusFar) {
	const iSelects=Array.isArray(iSelect) ? iSelect : [iSelect]
	const response={
		select: iSelects.map(iSigned=>{
			const i=Math.abs(iSigned)
			const select=Object.is(i,iSigned) // works correctly with -0
			return [i,select]
		}),
		stop: true
	}
	if (iFocus!=null) {
		response.focus={
			$item: $table.tBodies[iFocus].querySelector('.note-checkbox input'),
			far: !!focusFar,
		}
	}
	return response
}

function makePager(stepSize) {
	return {
		goPageUp  :($items,fromIndex)=>Math.max(fromIndex-stepSize,0),
		goPageDown:($items,fromIndex)=>Math.min(fromIndex+stepSize,$items.length-1),
	}
}
