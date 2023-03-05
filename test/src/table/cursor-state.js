import {strict as assert} from 'assert'
import {JSDOM} from 'jsdom'

import CursorState from '../../../test-build/table/cursor-state.js'

const globalProperties=[
	'HTMLElement',
	'HTMLInputElement',
	'HTMLTableSectionElement'
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
		assert.deepEqual(cursorState.respondToKeyInHead({key:'A',ctrlKey:true}),{
			select: {
				selected: true,
				$fromSection: $table.tBodies[0],
				$toSection: $table.tBodies[3],
			},
			stop: true
		})
	})
	it("selects all from body",function(){
		const $table=makeTable(this.window.document,[1,1,1,1])
		const cursorState=new CursorState($table)
		assert.deepEqual(cursorState.respondToKeyInBody({key:'A',ctrlKey:true}),{
			select: {
				selected: true,
				$fromSection: $table.tBodies[0],
				$toSection: $table.tBodies[3],
			},
			stop: true
		})
	})
	it("selects with shift+move",function(){
		const $table=makeTable(this.window.document,[1,2,3,1])
		const cursorState=new CursorState($table)
		assert.deepEqual(cursorState.respondToKeyInBody({key:'ArrowDown',shiftKey:true}),{
			select: {
				selected: true,
				$fromSection: $table.tBodies[0],
				$toSection: $table.tBodies[0],
			},
			focus: {
				$item: $table.tBodies[1].querySelector('.note-checkbox input'),
				far: false,
			},
			stop: true
		})
		$table.tBodies[0].querySelector('.note-checkbox input').checked=true
		assert.deepEqual(cursorState.respondToKeyInBody({key:'ArrowDown',shiftKey:true}),{
			select: {
				selected: true,
				$fromSection: $table.tBodies[1],
				$toSection: $table.tBodies[1],
			},
			focus: {
				$item: $table.tBodies[2].querySelector('.note-checkbox input'),
				far: false,
			},
			stop: true
		})
		$table.tBodies[1].querySelector('.note-checkbox input').checked=true
		assert.deepEqual(cursorState.respondToKeyInBody({key:'ArrowDown',shiftKey:true}),{
			select: {
				selected: true,
				$fromSection: $table.tBodies[2],
				$toSection: $table.tBodies[2],
			},
			focus: {
				$item: $table.tBodies[3].querySelector('.note-checkbox input'),
				far: false,
			},
			stop: true
		})
	})
	it("deselects with shift+move",function(){
		const $table=makeTable(this.window.document,[1,2,3,1])
		for (const $checkbox of $table.querySelectorAll('.note-checkbox input')) {
			$checkbox.checked=true
		}
		const cursorState=new CursorState($table)
		assert.deepEqual(cursorState.respondToKeyInBody({key:'ArrowDown',shiftKey:true}),{
			select: {
				selected: false,
				$fromSection: $table.tBodies[0],
				$toSection: $table.tBodies[0],
			},
			focus: {
				$item: $table.tBodies[1].querySelector('.note-checkbox input'),
				far: false,
			},
			stop: true
		})
		$table.tBodies[0].querySelector('.note-checkbox input').checked=false
		assert.deepEqual(cursorState.respondToKeyInBody({key:'ArrowDown',shiftKey:true}),{
			select: {
				selected: false,
				$fromSection: $table.tBodies[1],
				$toSection: $table.tBodies[1],
			},
			focus: {
				$item: $table.tBodies[2].querySelector('.note-checkbox input'),
				far: false,
			},
			stop: true
		})
		$table.tBodies[1].querySelector('.note-checkbox input').checked=false
		assert.deepEqual(cursorState.respondToKeyInBody({key:'ArrowDown',shiftKey:true}),{
			select: {
				selected: false,
				$fromSection: $table.tBodies[2],
				$toSection: $table.tBodies[2],
			},
			focus: {
				$item: $table.tBodies[3].querySelector('.note-checkbox input'),
				far: false,
			},
			stop: true
		})
	})
	it("selects with shift+move over partially selected",function(){
		const $table=makeTable(this.window.document,[1,2,3,1])
		$table.tBodies[1].querySelector('.note-checkbox input').checked=true
		const cursorState=new CursorState($table)
		assert.deepEqual(cursorState.respondToKeyInBody({key:'ArrowDown',shiftKey:true}),{
			select: {
				selected: true,
				$fromSection: $table.tBodies[0],
				$toSection: $table.tBodies[0],
			},
			focus: {
				$item: $table.tBodies[1].querySelector('.note-checkbox input'),
				far: false,
			},
			stop: true
		})
		$table.tBodies[0].querySelector('.note-checkbox input').checked=true
		assert.deepEqual(cursorState.respondToKeyInBody({key:'ArrowDown',shiftKey:true}),{
			select: {
				selected: true,
				$fromSection: $table.tBodies[1],
				$toSection: $table.tBodies[1],
			},
			focus: {
				$item: $table.tBodies[2].querySelector('.note-checkbox input'),
				far: false,
			},
			stop: true
		})
	})
	it("selects and deselects with shift+move over partially selected and interruption",function(){
		const $table=makeTable(this.window.document,[1,2,3,1])
		$table.tBodies[1].querySelector('.note-checkbox input').checked=true
		const cursorState=new CursorState($table)
		assert.deepEqual(cursorState.respondToKeyInBody({key:'ArrowDown',shiftKey:true}),{
			select: {
				selected: true,
				$fromSection: $table.tBodies[0],
				$toSection: $table.tBodies[0],
			},
			focus: {
				$item: $table.tBodies[1].querySelector('.note-checkbox input'),
				far: false,
			},
			stop: true
		})
		$table.tBodies[0].querySelector('.note-checkbox input').checked=true
		cursorState.resetSelect()
		assert.deepEqual(cursorState.respondToKeyInBody({key:'ArrowDown',shiftKey:true}),{
			select: {
				selected: false,
				$fromSection: $table.tBodies[1],
				$toSection: $table.tBodies[1],
			},
			focus: {
				$item: $table.tBodies[2].querySelector('.note-checkbox input'),
				far: false,
			},
			stop: true
		})
	})
	it("selects with shift+move against the first row",function(){
		const $table=makeTable(this.window.document,[1,2,3,1])
		const cursorState=new CursorState($table)
		assert.deepEqual(cursorState.respondToKeyInBody({key:'ArrowUp',shiftKey:true}),{
			select: {
				selected: true,
				$fromSection: $table.tBodies[0],
				$toSection: $table.tBodies[0],
			},
			stop: true
		})
	})
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
