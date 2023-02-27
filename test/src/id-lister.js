import {strict as assert} from 'assert'
import listNoteIds from '../../test-build/id-lister.js'

describe("IdLister",()=>{
	it("returns empty string",()=>{
		assert.equal(
			listNoteIds([]),
			``
		)
	})
	it("returns single id",()=>{
		assert.equal(
			listNoteIds([123]),
			`note 123`
		)
	})
	it("returns sorted ids",()=>{
		assert.equal(
			listNoteIds([123,45,67]),
			`notes 45,67,123`
		)
	})
	it("returns sorted ids with ranges",()=>{
		assert.equal(
			listNoteIds([101,99,97,100,103]),
			`notes 97,99-101,103`
		)
	})
	it("returns id range",()=>{
		assert.equal(
			listNoteIds([1001,1002,1003,1004]),
			`notes 1001-1004`
		)
	})
	it("returns id pair",()=>{
		assert.equal(
			listNoteIds([144,145]),
			`notes 144,145`
		)
	})
})
