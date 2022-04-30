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
		const result=parseLoose(`123450`)
		assert.deepEqual(result,[123450,undefined])
	})
	it("returns unknown id on padded number input",()=>{
		const result=parseLoose(`  1234567   `)
		assert.deepEqual(result,[1234567,undefined])
	})
	it("returns unknown id on input with number preceded by rubbish",()=>{
		const result=parseLoose(`sdhfsk hkjsh owieij 54321`)
		assert.deepEqual(result,[54321,undefined])
	})
	it("returns changeset id on basic changeset input",()=>{
		const result=parseLoose(`changeset 87655678`)
		assert.deepEqual(result,[87655678,'changeset'])
	})
	it("returns changeset id on extended changeset input",()=>{
		const result=parseLoose(`Relevant details added in changeset 12345678 `)
		assert.deepEqual(result,[12345678,'changeset'])
	})
	it("returns changeset id on extended changeset input with caps",()=>{
		const result=parseLoose(`Added to wheelchair:description in Changeset: 1122334455`)
		assert.deepEqual(result,[1122334455,'changeset'])
	})
})
