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
	it("provides subsequent fetch for newest-first order",()=>{
		const makeNote=(id,date)=>({
			id,
			lat: 60,
			lon: 30,
			status: 'open',
			comments: [{
				date,
				action: 'opened',
				text: 'Hello!'
			}]
		})
		const notes=[
			makeNote(1,1645398621),
			makeNote(2,1645298621),
			makeNote(3,1645198621) // 2022-02-18T15:37:01Z
		]
		const fd=getNextFetchDetails({
			user: 'Dude',
			status: 'mixed',
			sort: 'created_at',
			order: 'newest',
			limit: 3
		},notes,notes)
		assert(fd.autorun)
		assert.equal(fd.parameters,`display_name=Dude&sort=created_at&order=newest&closed=-1&limit=3&from=2001-01-01T00%3A00%3A00Z&to=2022-02-18T15%3A37%3A02Z`)
	})
	it("provides subsequent fetch for newest-first order",()=>{
		const makeNote=(id,date)=>({
			id,
			lat: 60,
			lon: 30,
			status: 'open',
			comments: [{
				date,
				action: 'opened',
				text: 'Hello!'
			}]
		})
		const notes=[
			makeNote(1,1643198621),
			makeNote(2,1644198621),
			makeNote(3,1645198621) // 2022-02-18T15:37:01Z
		]
		const fd=getNextFetchDetails({
			user: 'Dude',
			status: 'mixed',
			sort: 'created_at',
			order: 'oldest',
			limit: 3
		},notes,notes)
		assert(fd.autorun)
		assert.equal(fd.parameters,`display_name=Dude&sort=created_at&order=oldest&closed=-1&limit=3&from=2022-02-18T15%3A37%3A01Z`)
	})
	// TODO test multiple comments created sort
	// TODO test multiple comments updated sort
})
