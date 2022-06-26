import {strict as assert} from 'assert'
import {getNextFetchDetails, makeNoteQueryFromHash} from '../test-build/query.js'

const makeNote=(id,...dates)=>({
	id,
	lat: 60,
	lon: 30,
	status: 'open',
	comments: dates.map((date,i)=>({
		date,
		action: i==0 ? 'opened' : 'commented',
		text: 'Hello!'
	}))
})

describe("query module / makeNoteQueryFromHash()",()=>{
	it("returns empty query for empty string",()=>{
		const query=makeNoteQueryFromHash(``)
		assert.equal(query,undefined)
	})
	it("builds default query for empty search",()=>{
		const query=makeNoteQueryFromHash(`#mode=search`)
		assert.deepEqual(query,{
			mode: 'search',
			closed: -1,
			sort: 'created_at',
			order: 'newest'
		})
	})
	it("builds default query for username",()=>{
		const query=makeNoteQueryFromHash(`#mode=search&display_name=Some%20User`)
		assert.deepEqual(query,{
			mode: 'search',
			display_name: 'Some User',
			closed: -1,
			sort: 'created_at',
			order: 'newest'
		})
	})
})

describe("query module / getNextFetchDetails()",()=>{
	it("provides username initial fetch",()=>{
		const fd=getNextFetchDetails({
			mode: 'search',
			display_name: 'Someone',
			closed: -1,
			sort: 'created_at',
			order: 'newest',
		},12)
		assert.equal(fd.limit,12)
		assert.deepEqual(fd.parametersList,[`display_name=Someone&sort=created_at&order=newest&closed=-1&limit=12`])
	})
	it("provides uid initial fetch",()=>{
		const fd=getNextFetchDetails({
			mode: 'search',
			user: 31337,
			closed: -1,
			sort: 'created_at',
			order: 'newest',
		},21)
		assert.equal(fd.limit,21)
		assert.deepEqual(fd.parametersList,[`user=31337&sort=created_at&order=newest&closed=-1&limit=21`])
	})
	it("provides open notes initial fetch",()=>{
		const fd=getNextFetchDetails({
			mode: 'search',
			display_name: 'SomeOne',
			closed: 0,
			sort: 'created_at',
			order: 'newest',
		},23)
		assert.equal(fd.limit,23)
		assert.deepEqual(fd.parametersList,[`display_name=SomeOne&sort=created_at&order=newest&closed=0&limit=23`])
	})
	context("with a single-comment notes",()=>{
		for (const sort of ['created_at','updated_at']) {
			it(`provides subsequent fetch for newest-first ${sort} order`,()=>{
				const note=makeNote(3,1645198621) // 2022-02-18T15:37:01Z
				const fd=getNextFetchDetails({
					mode: 'search',
					display_name: 'Dude',
					closed: -1,
					sort,
					order: 'newest',
				},3,note)
				assert.equal(fd.limit,3)
				assert.deepEqual(fd.parametersList,[`display_name=Dude&sort=${sort}&order=newest&closed=-1&from=20010101T000000Z&to=20220218T153702Z&limit=3`])
			})
			it(`provides subsequent fetch for oldest-first ${sort} order`,()=>{
				const note=makeNote(3,1645198621) // 2022-02-18T15:37:01Z
				const fd=getNextFetchDetails({
					mode: 'search',
					display_name: 'Dude',
					closed: -1,
					sort,
					order: 'oldest',
				},3,note)
				assert.equal(fd.limit,3)
				assert.deepEqual(fd.parametersList,[`display_name=Dude&sort=${sort}&order=oldest&closed=-1&from=20220218T153701Z&limit=3`])
			})
		}
	})
	context("with a multiple-comment notes",()=>{
		const note=makeNote(3,1543215432,1546215432,1549215432) // 2018-11-26T06:57:12Z, ..., 2019-02-03T17:37:12Z
		it(`provides subsequent fetch for newest-first created_at order`,()=>{
			const fd=getNextFetchDetails({
				mode: 'search',
				display_name: 'Gimme',
				closed: -1,
				sort: 'created_at',
				order: 'newest',
			},3,note)
			assert.equal(fd.limit,3)
			assert.deepEqual(fd.parametersList,[`display_name=Gimme&sort=created_at&order=newest&closed=-1&from=20010101T000000Z&to=20181126T065713Z&limit=3`])
		})
		it(`provides subsequent fetch for newest-first updated_at order`,()=>{
			const fd=getNextFetchDetails({
				mode: 'search',
				display_name: 'Gimme',
				closed: -1,
				sort: 'updated_at',
				order: 'newest',
			},3,note)
			assert.equal(fd.limit,3)
			assert.deepEqual(fd.parametersList,[`display_name=Gimme&sort=updated_at&order=newest&closed=-1&from=20010101T000000Z&to=20190203T173713Z&limit=3`])
		})
	})
	it("decides not to grow the window",()=>{
		const note2=makeNote(11,1745198621) // different dates
		const note1=makeNote(12,1645198621) // 2022-02-18T15:37:01Z
		const fd=getNextFetchDetails({
			mode: 'search',
			display_name: 'Mapper',
			closed: -1,
			sort: 'created_at',
			order: 'newest',
		},3,note1,note2,3)
		assert.equal(fd.limit,3)
		assert.deepEqual(fd.parametersList,[`display_name=Mapper&sort=created_at&order=newest&closed=-1&from=20010101T000000Z&to=20220218T153702Z&limit=3`])
	})
	it("decides to grow the window",()=>{
		const note2=makeNote(11,1645198621) // same dates
		const note1=makeNote(12,1645198621) // 2022-02-18T15:37:01Z
		const fd=getNextFetchDetails({
			mode: 'search',
			display_name: 'Mapper',
			closed: -1,
			sort: 'created_at',
			order: 'newest',
		},3,note1,note2,3)
		assert.equal(fd.limit,6)
		assert.deepEqual(fd.parametersList,[`display_name=Mapper&sort=created_at&order=newest&closed=-1&from=20010101T000000Z&to=20220218T153702Z&limit=6`])
	})
	it("decides to grow the window further",()=>{
		const note2=makeNote(11,1645198621) // same dates
		const note1=makeNote(12,1645198621) // 2022-02-18T15:37:01Z
		const fd=getNextFetchDetails({
			mode: 'search',
			display_name: 'Mapper',
			closed: -1,
			sort: 'created_at',
			order: 'newest',
		},3,note1,note2,6)
		assert.equal(fd.limit,9)
		assert.deepEqual(fd.parametersList,[`display_name=Mapper&sort=created_at&order=newest&closed=-1&from=20010101T000000Z&to=20220218T153702Z&limit=9`])
	})
	context("with a lower bound date",()=>{
		const note=makeNote(3,1543215432) // 2018-11-26T06:57:12Z
		it("enforces lower bound on initial request",()=>{
			const fd=getNextFetchDetails({
				mode: 'search',
				from: makeDate('2015-06-07 12:34:56Z'),
				closed: -1,
				sort: 'created_at',
				order: 'newest',
			},7)
			assert.equal(fd.limit,7)
			assert.deepEqual(fd.parametersList,[`sort=created_at&order=newest&closed=-1&from=20150607T123456Z&limit=7`])
		})
		it("enforces lower bound on subsequent request with newest order",()=>{
			const fd=getNextFetchDetails({
				mode: 'search',
				from: makeDate('2015-06-07 12:34:56Z'),
				closed: -1,
				sort: 'created_at',
				order: 'newest',
			},3,note)
			assert.equal(fd.limit,3)
			assert.deepEqual(fd.parametersList,[`sort=created_at&order=newest&closed=-1&from=20150607T123456Z&to=20181126T065713Z&limit=3`])
		})
		it("updates lower bound on subsequent request with oldest order",()=>{
			const fd=getNextFetchDetails({
				mode: 'search',
				from: makeDate('2015-06-07 12:34:56Z'),
				closed: -1,
				sort: 'created_at',
				order: 'oldest',
			},3,note)
			assert.equal(fd.limit,3)
			assert.deepEqual(fd.parametersList,[`sort=created_at&order=oldest&closed=-1&from=20181126T065712Z&limit=3`])
		})
	})
	context("with an upper bound date",()=>{
		const note=makeNote(3,1543215432) // 2018-11-26T06:57:12Z
		it("enforces upper bound on initial request",()=>{
			const fd=getNextFetchDetails({
				mode: 'search',
				to: makeDate('2019-06-07 12:34:56Z'),
				closed: -1,
				sort: 'created_at',
				order: 'newest',
			},7)
			assert.equal(fd.limit,7)
			assert.deepEqual(fd.parametersList,[`sort=created_at&order=newest&closed=-1&from=20010101T000000Z&to=20190607T123456Z&limit=7`])
		})
		it("enforces upper bound on subsequent request with oldest order",()=>{
			const fd=getNextFetchDetails({
				mode: 'search',
				to: makeDate('2019-06-07 12:34:56Z'),
				closed: -1,
				sort: 'created_at',
				order: 'oldest',
			},3,note)
			assert.equal(fd.limit,3)
			assert.deepEqual(fd.parametersList,[`sort=created_at&order=oldest&closed=-1&from=20181126T065712Z&to=20190607T123456Z&limit=3`])
		})
		it("updates upper bound on subsequent request with newest order",()=>{
			const fd=getNextFetchDetails({
				mode: 'search',
				to: makeDate('2019-06-07 12:34:56Z'),
				closed: -1,
				sort: 'created_at',
				order: 'newest',
			},3,note)
			assert.equal(fd.limit,3)
			assert.deepEqual(fd.parametersList,[`sort=created_at&order=newest&closed=-1&from=20010101T000000Z&to=20181126T065713Z&limit=3`])
		})
		it("doesn't +1 upper bound on subsequent request with newest order when last note has exactly this date",()=>{
			const fd=getNextFetchDetails({
				mode: 'search',
				to: makeDate('2018-11-26 06:57:12Z'),
				closed: -1,
				sort: 'created_at',
				order: 'newest',
			},3,note)
			assert.equal(fd.limit,3)
			assert.deepEqual(fd.parametersList,[`sort=created_at&order=newest&closed=-1&from=20010101T000000Z&to=20181126T065712Z&limit=3`])
		})
	})
})

function makeDate(s) {
	return Date.parse(s)/1000
}
