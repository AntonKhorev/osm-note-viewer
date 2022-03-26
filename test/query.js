import {strict as assert} from 'assert'
import {toUserQuery, getNextFetchDetails} from '../test-build/query.js'

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

describe("query module / toUserQuery()",()=>{
	it("gives empty output on empty input",()=>{
		const uqp=toUserQuery(``)
		assert.equal(uqp.userType,'empty')
	})
	it("gives empty output on spaces",()=>{
		const uqp=toUserQuery(`   `)
		assert.equal(uqp.userType,'empty')
	})
	it("gives name on single word",()=>{
		const uqp=toUserQuery(`Alice`)
		assert.equal(uqp.userType,'name')
		assert.equal(uqp.username,`Alice`)
	})
	it("trims name",()=>{
		const uqp=toUserQuery(`  Bob   `)
		assert.equal(uqp.userType,'name')
		assert.equal(uqp.username,`Bob`)
	})
	it("gives id on #number",()=>{
		const uqp=toUserQuery(`#987`)
		assert.equal(uqp.userType,'id')
		assert.equal(uqp.uid,987)
	})
	it("trims id",()=>{
		const uqp=toUserQuery(` #654 `)
		assert.equal(uqp.userType,'id')
		assert.equal(uqp.uid,654)
	})
	it("ignores spaces after # in uid",()=>{
		const uqp=toUserQuery(`#  1357`)
		assert.equal(uqp.userType,'id')
		assert.equal(uqp.uid,1357)
	})
	it("gives invalid output if # is followed by non-numbers",()=>{
		const uqp=toUserQuery(`#13x57`)
		assert.equal(uqp.userType,'invalid')
		assert(uqp.message.includes('x'))
	})
	it("gives invalid output if # is not followed by anything",()=>{
		const uqp=toUserQuery(`#`)
		assert.equal(uqp.userType,'invalid')
		assert(uqp.message.includes('empty'))
	})
	it("parses osm user url",()=>{
		const uqp=toUserQuery(`https://www.openstreetmap.org/user/Bob`)
		assert.equal(uqp.userType,'name')
		assert.equal(uqp.username,`Bob`)
	})
	it("parses osm user subpage url",()=>{
		const uqp=toUserQuery(`https://www.openstreetmap.org/user/Fred/notes`)
		assert.equal(uqp.userType,'name')
		assert.equal(uqp.username,`Fred`)
	})
	it("parses osm user url with hash",()=>{
		const uqp=toUserQuery(`https://www.openstreetmap.org/user/User#content`)
		assert.equal(uqp.userType,'name')
		assert.equal(uqp.username,`User`)
	})
	it("parses osm user url with space",()=>{
		const uqp=toUserQuery(`https://www.openstreetmap.org/user/FirstName%20LastName`)
		assert.equal(uqp.userType,'name')
		assert.equal(uqp.username,`FirstName LastName`)
	})
	it("parses http osm user url",()=>{
		const uqp=toUserQuery(`http://www.openstreetmap.org/user/Bob`)
		assert.equal(uqp.userType,'name')
		assert.equal(uqp.username,`Bob`)
	})
	it("parses osm user url without www",()=>{
		const uqp=toUserQuery(`https://openstreetmap.org/user/John`)
		assert.equal(uqp.userType,'name')
		assert.equal(uqp.username,`John`)
	})
	it("parses www.osm.org user url",()=>{
		const uqp=toUserQuery(`https://www.osm.org/user/John`)
		assert.equal(uqp.userType,'name')
		assert.equal(uqp.username,`John`)
	})
	it("parses osm.org user url",()=>{
		const uqp=toUserQuery(`https://www.osm.org/user/John`)
		assert.equal(uqp.userType,'name')
		assert.equal(uqp.username,`John`)
	})
	it("rejects unknown domain",()=>{
		const uqp=toUserQuery(`https://www.google.com/user/John`)
		assert.equal(uqp.userType,'invalid')
		assert(uqp.message.includes('www.google.com'))
	})
	it("rejects malformed url",()=>{
		const uqp=toUserQuery(`ht/tp/s://ww/w.go/ogle.c/om/user/Jo/hn`)
		assert.equal(uqp.userType,'invalid')
	})
	it("rejects osm non-user url",()=>{
		const uqp=toUserQuery(`https://www.openstreetmap.org/`)
		assert.equal(uqp.userType,'invalid')
	})
	it("rejects osm incomplete user url",()=>{
		const uqp=toUserQuery(`https://www.openstreetmap.org/user`)
		assert.equal(uqp.userType,'invalid')
	})
	it("rejects osm incomplete user/ url",()=>{
		const uqp=toUserQuery(`https://www.openstreetmap.org/user/`)
		assert.equal(uqp.userType,'invalid')
	})
	it("parses osm api user link",()=>{
		const uqp=toUserQuery(`https://api.openstreetmap.org/api/0.6/user/15243`)
		assert.equal(uqp.userType,'id')
		assert.equal(uqp.uid,15243)
	})
	it("parses osm api json user link",()=>{
		const uqp=toUserQuery(`https://api.openstreetmap.org/api/0.6/user/51423.json`)
		assert.equal(uqp.userType,'id')
		assert.equal(uqp.uid,51423)
	})
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
				assert.equal(fd.parameters,`display_name=Dude&sort=${sort}&order=newest&closed=-1&limit=3&from=2001-01-01T00%3A00%3A00Z&to=2022-02-18T15%3A37%3A02Z`)
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
				assert.equal(fd.parameters,`display_name=Dude&sort=${sort}&order=oldest&closed=-1&limit=3&from=2022-02-18T15%3A37%3A01Z`)
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
			assert.equal(fd.parameters,`display_name=Gimme&sort=created_at&order=newest&closed=-1&limit=3&from=2001-01-01T00%3A00%3A00Z&to=2018-11-26T06%3A57%3A13Z`)
		})
		it(`provides subsequent fetch for newest-first updated_at order`,()=>{
			const fd=getNextFetchDetails({
				display_name: 'Gimme',
				closed: -1,
				sort: 'updated_at',
				order: 'newest',
			},3,note)
			assert.equal(fd.limit,3)
			assert.equal(fd.parameters,`display_name=Gimme&sort=updated_at&order=newest&closed=-1&limit=3&from=2001-01-01T00%3A00%3A00Z&to=2019-02-03T17%3A37%3A13Z`)
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
		assert.equal(fd.parameters,`display_name=Mapper&sort=created_at&order=newest&closed=-1&limit=3&from=2001-01-01T00%3A00%3A00Z&to=2022-02-18T15%3A37%3A02Z`)
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
		assert.equal(fd.parameters,`display_name=Mapper&sort=created_at&order=newest&closed=-1&limit=6&from=2001-01-01T00%3A00%3A00Z&to=2022-02-18T15%3A37%3A02Z`)
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
		assert.equal(fd.parameters,`display_name=Mapper&sort=created_at&order=newest&closed=-1&limit=9&from=2001-01-01T00%3A00%3A00Z&to=2022-02-18T15%3A37%3A02Z`)
	})
})
