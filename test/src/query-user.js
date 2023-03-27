import {strict as assert} from 'assert'
import {toUserQuery} from '../../test-build/query-user.js'

class ApiUrlLister {
	constructor(url) {
		this.url=url
	}
}

class WebUrlLister {
	constructor(urls) {
		this.urls=urls
		this.getUrl=webPath=>`${urls[0]}${webPath}`
	}
}

const defaultListers=[
	new ApiUrlLister(`https://api.openstreetmap.org/`),
	new WebUrlLister([
		`https://www.openstreetmap.org/`,
		`https://openstreetmap.org/`,
		`https://www.osm.org/`,
		`https://osm.org/`,
	])
]

describe("user query module / toUserQuery()",()=>{
	it("gives empty output on empty input",()=>{
		const uq=toUserQuery(...defaultListers,``)
		assert.equal(uq.userType,'empty')
	})
	it("gives empty output on spaces",()=>{
		const uq=toUserQuery(...defaultListers,`   `)
		assert.equal(uq.userType,'empty')
	})
	it("gives name on single word",()=>{
		const uq=toUserQuery(...defaultListers,`Alice`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`Alice`)
	})
	it("trims name",()=>{
		const uq=toUserQuery(...defaultListers,`  Bob   `)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`Bob`)
	})
	it("gives id on #number",()=>{
		const uq=toUserQuery(...defaultListers,`#987`)
		assert.equal(uq.userType,'id')
		assert.equal(uq.uid,987)
	})
	it("trims id",()=>{
		const uq=toUserQuery(...defaultListers,` #654 `)
		assert.equal(uq.userType,'id')
		assert.equal(uq.uid,654)
	})
	it("ignores spaces after # in uid",()=>{
		const uq=toUserQuery(...defaultListers,`#  1357`)
		assert.equal(uq.userType,'id')
		assert.equal(uq.uid,1357)
	})
	it("gives invalid output if # is followed by non-numbers",()=>{
		const uq=toUserQuery(...defaultListers,`#13x57`)
		assert.equal(uq.userType,'invalid')
		assert(uq.message.includes('x'))
	})
	it("gives invalid output if # is not followed by anything",()=>{
		const uq=toUserQuery(...defaultListers,`#`)
		assert.equal(uq.userType,'invalid')
		assert(uq.message.includes('empty'))
	})
	it("parses osm user url",()=>{
		const uq=toUserQuery(...defaultListers,`https://www.openstreetmap.org/user/Bob`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`Bob`)
	})
	it("parses osm user subpage url",()=>{
		const uq=toUserQuery(...defaultListers,`https://www.openstreetmap.org/user/Fred/notes`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`Fred`)
	})
	it("parses osm user url with hash",()=>{
		const uq=toUserQuery(...defaultListers,`https://www.openstreetmap.org/user/User#content`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`User`)
	})
	it("parses osm user url with space",()=>{
		const uq=toUserQuery(...defaultListers,`https://www.openstreetmap.org/user/FirstName%20LastName`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`FirstName LastName`)
	})
	it("parses http osm user url",()=>{
		const uq=toUserQuery(...defaultListers,`http://www.openstreetmap.org/user/Bob`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`Bob`)
	})
	it("parses osm user url without www",()=>{
		const uq=toUserQuery(...defaultListers,`https://openstreetmap.org/user/John`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`John`)
	})
	it("parses www.osm.org user url",()=>{
		const uq=toUserQuery(...defaultListers,`https://www.osm.org/user/John`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`John`)
	})
	it("parses osm.org user url",()=>{
		const uq=toUserQuery(...defaultListers,`https://www.osm.org/user/John`)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`John`)
	})
	it("rejects unknown domain",()=>{
		const uq=toUserQuery(...defaultListers,`https://www.google.com/user/John`)
		assert.equal(uq.userType,'invalid')
		assert(uq.message.includes('www.google.com'))
	})
	it("rejects malformed url",()=>{
		const uq=toUserQuery(...defaultListers,`ht/tp/s://ww/w.go/ogle.c/om/user/Jo/hn`)
		assert.equal(uq.userType,'invalid')
	})
	it("rejects osm non-user url",()=>{
		const uq=toUserQuery(...defaultListers,`https://www.openstreetmap.org/`)
		assert.equal(uq.userType,'invalid')
	})
	it("rejects osm incomplete user url",()=>{
		const uq=toUserQuery(...defaultListers,`https://www.openstreetmap.org/user`)
		assert.equal(uq.userType,'invalid')
	})
	it("rejects osm incomplete user/ url",()=>{
		const uq=toUserQuery(...defaultListers,`https://www.openstreetmap.org/user/`)
		assert.equal(uq.userType,'invalid')
	})
	it("parses osm api user link",()=>{
		const uq=toUserQuery(...defaultListers,`https://api.openstreetmap.org/api/0.6/user/15243`)
		assert.equal(uq.userType,'id')
		assert.equal(uq.uid,15243)
	})
	it("parses osm api user link on web domain",()=>{
		const uq=toUserQuery(...defaultListers,`https://www.openstreetmap.org/api/0.6/user/15843`)
		assert.equal(uq.userType,'id')
		assert.equal(uq.uid,15843)
	})
	it("parses osm api json user link",()=>{
		const uq=toUserQuery(...defaultListers,`https://api.openstreetmap.org/api/0.6/user/51423.json`)
		assert.equal(uq.userType,'id')
		assert.equal(uq.uid,51423)
	})
	it("parses custom server links",()=>{
		const uq=toUserQuery(
			new ApiUrlLister(`https://www.openhistoricalmap.org/`),
			new WebUrlLister([
				`https://www.openhistoricalmap.org/`,
				`https://openhistoricalmap.org/`
			]),
			`https://www.openhistoricalmap.org/user/Bob`
		)
		assert.equal(uq.userType,'name')
		assert.equal(uq.username,`Bob`)
	})
})
