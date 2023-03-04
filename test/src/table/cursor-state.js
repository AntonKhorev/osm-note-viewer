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
		const $table=makeTable(this.window.document,1)
		const cursorState=new CursorState($table)
		const keyResponse=cursorState.respondToKeyInHead({key:'ArrowRight'})
		assert.deepEqual(keyResponse,{
			focus: {
				$item: $table.tHead.querySelector('.note-link button'),
				far: false
			},
			stop: true
		})
	})
	it("selects all from head",function(){
		const $table=makeTable(this.window.document,4)
		const cursorState=new CursorState($table)
		const keyResponse=cursorState.respondToKeyInHead({key:'A',ctrlKey:true})
		assert.deepEqual(keyResponse,{
			select: {
				selected: true,
				$fromSection: $table.tBodies[0],
				$toSection: $table.tBodies[3]
			},
			stop: true
		})
	})
	it("selects all from body",function(){
		const $table=makeTable(this.window.document,4)
		const cursorState=new CursorState($table)
		const keyResponse=cursorState.respondToKeyInBody({key:'A',ctrlKey:true})
		assert.deepEqual(keyResponse,{
			select: {
				selected: true,
				$fromSection: $table.tBodies[0],
				$toSection: $table.tBodies[3]
			},
			stop: true
		})
	})
})

function makeTable(document,nSections) {
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
	for (let i=0;i<nSections;i++) {
		const $section=$table.createTBody()
		const $row=$section.insertRow()
		$row.innerHTML=`
			<td class="note-checkbox"><input type="checkbox">
			<td class="note-link"><a href=#>${100500+i}</a>
			<td class="note-comments-count"><button>+</button>
			<td class="note-date"><time tabindex="0">2023-03-03</time>
			<td class="note-user"><a href=#>TheUser</a>
			<td class="note-action"><span class="icon-status-open" tabindex="0">!</span>
			<td class="note-comment">note ${i}
			<td class="note-map"><a href=#>M</a>
		`
	}
	document.body.append($table)
	return $table
}
