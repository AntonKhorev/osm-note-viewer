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

describe("query module",()=>{
	it("provides username initial fetch",()=>{
		const fd=getNextFetchDetails({
			userType: 'name',
			username: 'Someone',
			status: 'mixed',
			sort: 'created_at',
			order: 'newest',
			limit: 12
		})
		assert.equal(fd.limit,12)
		assert.equal(fd.parameters,`display_name=Someone&sort=created_at&order=newest&closed=-1&limit=12`)
	})
	it("provides uid initial fetch",()=>{
		const fd=getNextFetchDetails({
			userType: 'id',
			uid: 31337,
			status: 'mixed',
			sort: 'created_at',
			order: 'newest',
			limit: 21
		})
		assert.equal(fd.limit,21)
		assert.equal(fd.parameters,`user=31337&sort=created_at&order=newest&closed=-1&limit=21`)
	})
	it("provides open notes initial fetch",()=>{
		const fd=getNextFetchDetails({
			userType: 'name',
			username: 'SomeOne',
			status: 'open',
			sort: 'created_at',
			order: 'newest',
			limit: 23
		})
		assert.equal(fd.limit,23)
		assert.equal(fd.parameters,`display_name=SomeOne&sort=created_at&order=newest&closed=0&limit=23`)
	})
	context("with a single-comment notes",()=>{
		for (const sort of ['created_at','updated_at']) {
			it(`provides subsequent fetch for newest-first ${sort} order`,()=>{
				const note=makeNote(3,1645198621) // 2022-02-18T15:37:01Z
				const fd=getNextFetchDetails({
					userType: 'name',
					username: 'Dude',
					status: 'mixed',
					sort,
					order: 'newest',
					limit: 3
				},note)
				assert.equal(fd.limit,3)
				assert.equal(fd.parameters,`display_name=Dude&sort=${sort}&order=newest&closed=-1&limit=3&from=2001-01-01T00%3A00%3A00Z&to=2022-02-18T15%3A37%3A02Z`)
			})
			it(`provides subsequent fetch for oldest-first ${sort} order`,()=>{
				const note=makeNote(3,1645198621) // 2022-02-18T15:37:01Z
				const fd=getNextFetchDetails({
					userType: 'name',
					username: 'Dude',
					status: 'mixed',
					sort,
					order: 'oldest',
					limit: 3
				},note)
				assert.equal(fd.limit,3)
				assert.equal(fd.parameters,`display_name=Dude&sort=${sort}&order=oldest&closed=-1&limit=3&from=2022-02-18T15%3A37%3A01Z`)
			})
		}
	})
	context("with a multiple-comment notes",()=>{
		const note=makeNote(3,1543215432,1546215432,1549215432) // 2018-11-26T06:57:12Z, ..., 2019-02-03T17:37:12Z
		it(`provides subsequent fetch for newest-first created_at order`,()=>{
			const fd=getNextFetchDetails({
				userType: 'name',
				username: 'Gimme',
				status: 'mixed',
				sort: 'created_at',
				order: 'newest',
				limit: 3
			},note)
			assert.equal(fd.limit,3)
			assert.equal(fd.parameters,`display_name=Gimme&sort=created_at&order=newest&closed=-1&limit=3&from=2001-01-01T00%3A00%3A00Z&to=2018-11-26T06%3A57%3A13Z`)
		})
		it(`provides subsequent fetch for newest-first updated_at order`,()=>{
			const fd=getNextFetchDetails({
				userType: 'name',
				username: 'Gimme',
				status: 'mixed',
				sort: 'updated_at',
				order: 'newest',
				limit: 3
			},note)
			assert.equal(fd.limit,3)
			assert.equal(fd.parameters,`display_name=Gimme&sort=updated_at&order=newest&closed=-1&limit=3&from=2001-01-01T00%3A00%3A00Z&to=2019-02-03T17%3A37%3A13Z`)
		})
	})
	it("decides not to grow the window",()=>{
		const note2=makeNote(11,1745198621) // different dates
		const note1=makeNote(12,1645198621) // 2022-02-18T15:37:01Z
		const fd=getNextFetchDetails({
			userType: 'name',
			username: 'Mapper',
			status: 'mixed',
			sort: 'created_at',
			order: 'newest',
			limit: 3
		},note1,note2,3)
		assert.equal(fd.limit,3)
		assert.equal(fd.parameters,`display_name=Mapper&sort=created_at&order=newest&closed=-1&limit=3&from=2001-01-01T00%3A00%3A00Z&to=2022-02-18T15%3A37%3A02Z`)
	})
	it("decides to grow the window",()=>{
		const note2=makeNote(11,1645198621) // same dates
		const note1=makeNote(12,1645198621) // 2022-02-18T15:37:01Z
		const fd=getNextFetchDetails({
			userType: 'name',
			username: 'Mapper',
			status: 'mixed',
			sort: 'created_at',
			order: 'newest',
			limit: 3
		},note1,note2,3)
		assert.equal(fd.limit,6)
		assert.equal(fd.parameters,`display_name=Mapper&sort=created_at&order=newest&closed=-1&limit=6&from=2001-01-01T00%3A00%3A00Z&to=2022-02-18T15%3A37%3A02Z`)
	})
	it("decides to grow the window further",()=>{
		const note2=makeNote(11,1645198621) // same dates
		const note1=makeNote(12,1645198621) // 2022-02-18T15:37:01Z
		const fd=getNextFetchDetails({
			userType: 'name',
			username: 'Mapper',
			status: 'mixed',
			sort: 'created_at',
			order: 'newest',
			limit: 3
		},note1,note2,6)
		assert.equal(fd.limit,9)
		assert.equal(fd.parameters,`display_name=Mapper&sort=created_at&order=newest&closed=-1&limit=9&from=2001-01-01T00%3A00%3A00Z&to=2022-02-18T15%3A37%3A02Z`)
	})
})
