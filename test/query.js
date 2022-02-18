import {strict as assert} from 'assert'
import {getNextFetchDetails} from '../test-build/query.js'

describe("query module",()=>{
	it("provides simple initial fetch",()=>{
		const fd=getNextFetchDetails({
			user: 'Someone',
			status: 'mixed',
			sort: 'created_at',
			order: 'newest',
			limit: 12
		},[],[])
		assert(fd.autorun)
		assert.equal(fd.parameters,`display_name=Someone&sort=created_at&order=newest&closed=-1&limit=12`)
	})
	it("provides open notes initial fetch",()=>{
		const fd=getNextFetchDetails({
			user: 'SomeOne',
			status: 'open',
			sort: 'created_at',
			order: 'newest',
			limit: 23
		},[],[])
		assert(fd.autorun)
		assert.equal(fd.parameters,`display_name=SomeOne&sort=created_at&order=newest&closed=0&limit=23`)
	})
})
