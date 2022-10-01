import {strict as assert} from 'assert'
import {NoteIdsFetcherRequest} from '../test-build/fetch.js'

describe("NoteIdsFetcherRequest",()=>{
	it("returns correct api urls for one note",()=>{
		const fetcherRequest=new NoteIdsFetcherRequest()
		const query={
			mode: 'ids',
			ids: [38,39,40,41,42]
		}
		assert.deepEqual(
			fetcherRequest.getRequestUrls(query,5),
			[
				['json',`https://api.openstreetmap.org/api/0.6/notes/38.json`],
				['xml',`https://api.openstreetmap.org/api/0.6/notes/38`],
				['gpx',`https://api.openstreetmap.org/api/0.6/notes/38.gpx`],
				['rss',`https://api.openstreetmap.org/api/0.6/notes/38.rss`],
			]
		)
	})
})
