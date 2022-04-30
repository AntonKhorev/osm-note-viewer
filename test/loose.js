import {strict as assert} from 'assert'
import parseLoose from '../test-build/loose.js'

describe("loose parser module",()=>{
	it("returns null on empty input",()=>{
		const result=parseLoose(``)
		assert.equal(result,null)
	})
	it("returns null on input without number",()=>{
		const result=parseLoose(`lorem ipsum (tm)`)
		assert.equal(result,null)
	})
	it("returns unknown id on number input",()=>{
		const result=parseLoose(`12345`)
		assert.deepEqual(result,[12345,undefined])
	})
	it("returns unknown id on padded number input",()=>{
		const result=parseLoose(`  1234567   `)
		assert.deepEqual(result,[1234567,undefined])
	})
	it("returns unknown id on input with number preceded by rubbish",()=>{
		const result=parseLoose(`sdhfsk hkjsh owieij 54321`)
		assert.deepEqual(result,[54321,undefined])
	})
})
