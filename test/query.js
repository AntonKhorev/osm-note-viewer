import {strict as assert} from 'assert'
import {getNextFetchDetails} from '../test-build/query.js'

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

describe("query module / getNextFetchDetails()",()=>{
	it("provides username initial fetch",()=>{
		const fd=getNextFetchDetails({
			display_name: 'Someone',
			closed: -1,
			sort: 'created_at',
			order: 'newest',
		},12)
		assert.equal(fd.limit,12)
		assert.equal(fd.parameters,`display_name=Someone&sort=created_at&order=newest&closed=-1&limit=12`)
	})
	it("provides uid initial fetch",()=>{
		const fd=getNextFetchDetails({
			user: 31337,
			closed: -1,
			sort: 'created_at',
			order: 'newest',
		},21)
		assert.equal(fd.limit,21)
		assert.equal(fd.parameters,`user=31337&sort=created_at&order=newest&closed=-1&limit=21`)
	})
	it("provides open notes initial fetch",()=>{
		const fd=getNextFetchDetails({
			display_name: 'SomeOne',
			closed: 0,
			sort: 'created_at',
			order: 'newest',
		},23)
		assert.equal(fd.limit,23)
		assert.equal(fd.parameters,`display_name=SomeOne&sort=created_at&order=newest&closed=0&limit=23`)
	})
	context("with a single-comment notes",()=>{
		for (const sort of ['created_at','updated_at']) {
			it(`provides subsequent fetch for newest-first ${sort} order`,()=>{
				const note=makeNote(3,1645198621) // 2022-02-18T15:37:01Z
				const fd=getNextFetchDetails({
					display_name: 'Dude',
					closed: -1,
					sort,
					order: 'newest',
				},3,note)
				assert.equal(fd.limit,3)
				assert.equal(fd.parameters,`display_name=Dude&sort=${sort}&order=newest&closed=-1&limit=3&from=20010101T000000Z&to=20220218T153702Z`)
			})
			it(`provides subsequent fetch for oldest-first ${sort} order`,()=>{
				const note=makeNote(3,1645198621) // 2022-02-18T15:37:01Z
				const fd=getNextFetchDetails({
					display_name: 'Dude',
					closed: -1,
					sort,
					order: 'oldest',
				},3,note)
				assert.equal(fd.limit,3)
				assert.equal(fd.parameters,`display_name=Dude&sort=${sort}&order=oldest&closed=-1&limit=3&from=20220218T153701Z`)
			})
		}
	})
	context("with a multiple-comment notes",()=>{
		const note=makeNote(3,1543215432,1546215432,1549215432) // 2018-11-26T06:57:12Z, ..., 2019-02-03T17:37:12Z
		it(`provides subsequent fetch for newest-first created_at order`,()=>{
			const fd=getNextFetchDetails({
				display_name: 'Gimme',
				closed: -1,
				sort: 'created_at',
				order: 'newest',
			},3,note)
			assert.equal(fd.limit,3)
			assert.equal(fd.parameters,`display_name=Gimme&sort=created_at&order=newest&closed=-1&limit=3&from=20010101T000000Z&to=20181126T065713Z`)
		})
		it(`provides subsequent fetch for newest-first updated_at order`,()=>{
			const fd=getNextFetchDetails({
				display_name: 'Gimme',
				closed: -1,
				sort: 'updated_at',
				order: 'newest',
			},3,note)
			assert.equal(fd.limit,3)
			assert.equal(fd.parameters,`display_name=Gimme&sort=updated_at&order=newest&closed=-1&limit=3&from=20010101T000000Z&to=20190203T173713Z`)
		})
	})
	it("decides not to grow the window",()=>{
		const note2=makeNote(11,1745198621) // different dates
		const note1=makeNote(12,1645198621) // 2022-02-18T15:37:01Z
		const fd=getNextFetchDetails({
			display_name: 'Mapper',
			closed: -1,
			sort: 'created_at',
			order: 'newest',
		},3,note1,note2,3)
		assert.equal(fd.limit,3)
		assert.equal(fd.parameters,`display_name=Mapper&sort=created_at&order=newest&closed=-1&limit=3&from=20010101T000000Z&to=20220218T153702Z`)
	})
	it("decides to grow the window",()=>{
		const note2=makeNote(11,1645198621) // same dates
		const note1=makeNote(12,1645198621) // 2022-02-18T15:37:01Z
		const fd=getNextFetchDetails({
			display_name: 'Mapper',
			closed: -1,
			sort: 'created_at',
			order: 'newest',
		},3,note1,note2,3)
		assert.equal(fd.limit,6)
		assert.equal(fd.parameters,`display_name=Mapper&sort=created_at&order=newest&closed=-1&limit=6&from=20010101T000000Z&to=20220218T153702Z`)
	})
	it("decides to grow the window further",()=>{
		const note2=makeNote(11,1645198621) // same dates
		const note1=makeNote(12,1645198621) // 2022-02-18T15:37:01Z
		const fd=getNextFetchDetails({
			display_name: 'Mapper',
			closed: -1,
			sort: 'created_at',
			order: 'newest',
		},3,note1,note2,6)
		assert.equal(fd.limit,9)
		assert.equal(fd.parameters,`display_name=Mapper&sort=created_at&order=newest&closed=-1&limit=9&from=20010101T000000Z&to=20220218T153702Z`)
	})
	context("with a lower bound date",()=>{
		const note=makeNote(3,1543215432) // 2018-11-26T06:57:12Z
		it("enforces lower bound on initial request",()=>{
			const fd=getNextFetchDetails({
				from: '20150607T123456Z',
				closed: -1,
				sort: 'created_at',
				order: 'newest',
			},7)
			assert.equal(fd.limit,7)
			assert.equal(fd.parameters,`sort=created_at&order=newest&closed=-1&limit=7&from=20150607T123456Z`)
		})
		it("enforces lower bound on subsequent request with newest order",()=>{
			const fd=getNextFetchDetails({
				from: '20150607T123456Z',
				closed: -1,
				sort: 'created_at',
				order: 'newest',
			},3,note)
			assert.equal(fd.limit,3)
			assert.equal(fd.parameters,`sort=created_at&order=newest&closed=-1&limit=3&from=20150607T123456Z&to=20181126T065713Z`)
		})
		it("updates lower bound on subsequent request with oldest order",()=>{
			const fd=getNextFetchDetails({
				from: '20150607T123456Z',
				closed: -1,
				sort: 'created_at',
				order: 'oldest',
			},3,note)
			assert.equal(fd.limit,3)
			assert.equal(fd.parameters,`sort=created_at&order=oldest&closed=-1&limit=3&from=20181126T065712Z`)
		})
	})
})
