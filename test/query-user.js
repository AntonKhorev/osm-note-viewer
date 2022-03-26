import {strict as assert} from 'assert'
import {toUserQuery} from '../test-build/query-user.js'

describe("user query module / toUserQuery()",()=>{
	it("gives empty output on empty input",()=>{
		const uq=toUserQuery(``)
		assert.equal(uq.userType,'empty')
	})
	it("gives empty output on spaces",()=>{
		const uq=toUserQuery(`   `)
		assert.equal(uq.userType,'empty')
	})
	it("gives name on single word",()=>{
		const uq=toUserQuery(`Alice`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`Alice`)
	})
	it("trims name",()=>{
		const uq=toUserQuery(`  Bob   `)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`Bob`)
	})
	it("gives id on #number",()=>{
		const uq=toUserQuery(`#987`)
		assert.equal(uq.userType,'id')
		assert.equal(uq.uid,987)
	})
	it("trims id",()=>{
		const uq=toUserQuery(` #654 `)
		assert.equal(uq.userType,'id')
		assert.equal(uq.uid,654)
	})
	it("ignores spaces after # in uid",()=>{
		const uq=toUserQuery(`#  1357`)
		assert.equal(uq.userType,'id')
		assert.equal(uq.uid,1357)
	})
	it("gives invalid output if # is followed by non-numbers",()=>{
		const uq=toUserQuery(`#13x57`)
		assert.equal(uq.userType,'invalid')
		assert(uq.message.includes('x'))
	})
	it("gives invalid output if # is not followed by anything",()=>{
		const uq=toUserQuery(`#`)
		assert.equal(uq.userType,'invalid')
		assert(uq.message.includes('empty'))
	})
	it("parses osm user url",()=>{
		const uq=toUserQuery(`https://www.openstreetmap.org/user/Bob`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`Bob`)
	})
	it("parses osm user subpage url",()=>{
		const uq=toUserQuery(`https://www.openstreetmap.org/user/Fred/notes`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`Fred`)
	})
	it("parses osm user url with hash",()=>{
		const uq=toUserQuery(`https://www.openstreetmap.org/user/User#content`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`User`)
	})
	it("parses osm user url with space",()=>{
		const uq=toUserQuery(`https://www.openstreetmap.org/user/FirstName%20LastName`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`FirstName LastName`)
	})
	it("parses http osm user url",()=>{
		const uq=toUserQuery(`http://www.openstreetmap.org/user/Bob`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`Bob`)
	})
	it("parses osm user url without www",()=>{
		const uq=toUserQuery(`https://openstreetmap.org/user/John`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`John`)
	})
	it("parses www.osm.org user url",()=>{
		const uq=toUserQuery(`https://www.osm.org/user/John`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`John`)
	})
	it("parses osm.org user url",()=>{
		const uq=toUserQuery(`https://www.osm.org/user/John`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`John`)
	})
	it("rejects unknown domain",()=>{
		const uq=toUserQuery(`https://www.google.com/user/John`)
		assert.equal(uq.userType,'invalid')
		assert(uq.message.includes('www.google.com'))
	})
	it("rejects malformed url",()=>{
		const uq=toUserQuery(`ht/tp/s://ww/w.go/ogle.c/om/user/Jo/hn`)
		assert.equal(uq.userType,'invalid')
	})
	it("rejects osm non-user url",()=>{
		const uq=toUserQuery(`https://www.openstreetmap.org/`)
		assert.equal(uq.userType,'invalid')
	})
	it("rejects osm incomplete user url",()=>{
		const uq=toUserQuery(`https://www.openstreetmap.org/user`)
		assert.equal(uq.userType,'invalid')
	})
	it("rejects osm incomplete user/ url",()=>{
		const uq=toUserQuery(`https://www.openstreetmap.org/user/`)
		assert.equal(uq.userType,'invalid')
	})
	it("parses osm api user link",()=>{
		const uq=toUserQuery(`https://api.openstreetmap.org/api/0.6/user/15243`)
		assert.equal(uq.userType,'id')
		assert.equal(uq.uid,15243)
	})
	it("parses osm api json user link",()=>{
		const uq=toUserQuery(`https://api.openstreetmap.org/api/0.6/user/51423.json`)
		assert.equal(uq.userType,'id')
		assert.equal(uq.uid,51423)
	})
})
