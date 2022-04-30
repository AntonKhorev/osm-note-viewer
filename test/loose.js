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
	it("returns changeset id on multiline changeset url input",()=>{
		const result=parseLoose(`blabla:\nhttps://www.openstreetmap.org/changeset/99887766`)
		assert.deepEqual(result,[99887766,'changeset'])
	})
	it("returns node id on basic note input",()=>{
		const result=parseLoose(`note 78987`)
		assert.deepEqual(result,[78987,'note'])
	})
	it("returns node id on basic node input",()=>{
		const result=parseLoose(`node 1020304050`)
		assert.deepEqual(result,[1020304050,'node'])
	})
	it("returns way id on basic way input",()=>{
		const result=parseLoose(`way 10203040`)
		assert.deepEqual(result,[10203040,'way'])
	})
	it("returns relation id on basic relation input",()=>{
		const result=parseLoose(`relation 102030`)
		assert.deepEqual(result,[102030,'relation'])
	})
	it("returns node id if node comes last in way and node input",()=>{
		const result=parseLoose(`way 332211 and node 55443322`)
		assert.deepEqual(result,[55443322,'node'])
	})
	it("returns way id if way comes last in node and way input",()=>{
		const result=parseLoose(`node 55443322 and way 332211`)
		assert.deepEqual(result,[332211,'way'])
	})
})
