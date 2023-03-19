import {strict as assert} from 'assert'
import {listDecoratedNoteIds} from '../../test-build/id-lister.js'

describe("IdLister",()=>{
	it("returns empty result",()=>{
		assert.deepEqual(
			listDecoratedNoteIds([]),
			[]
		)
	})
	it("returns single id",()=>{
		assert.deepEqual(
			listDecoratedNoteIds([123]),
			[[`note `],[`123`,123]]
		)
	})
	it("returns sorted ids",()=>{
		assert.deepEqual(
			listDecoratedNoteIds([123,45,67]),
			[[`notes `],[`45`,45],[`,`],[`67`,67],[`,`],[`123`,123]]
		)
	})
	it("returns sorted ids with ranges",()=>{
		assert.deepEqual(
			listDecoratedNoteIds([101,99,97,100,103]),
			[[`notes `],[`97`,97],[`,`],[`99`,99],[`-`],[`101`,101],[`,`],[`103`,103]]
		)
	})
	it("returns id range",()=>{
		assert.deepEqual(
			listDecoratedNoteIds([1001,1002,1003,1004]),
			[[`notes `],[`1001`,1001],[`-`],[`1004`,1004]]
		)
	})
	it("returns id pair",()=>{
		assert.deepEqual(
			listDecoratedNoteIds([144,145]),
			[[`notes `],[`144`,144],[`,`],[`145`,145]]
		)
	})
})
