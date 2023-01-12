import {strict as assert} from 'assert'
import {NoteIdsFetcherRequest} from '../../test-build/fetch.js'

describe("NoteIdsFetcherRequest",()=>{
	it("returns correct api urls for one note",()=>{
		const fetcherRequest=new NoteIdsFetcherRequest()
		const query={
			mode: 'ids',
			ids: [38,39,40,41,42]
		}
		assert.deepEqual(
			fetcherRequest.getRequestApiPaths(query,5),
			[
				['json',`notes/38.json`],
				['xml',`notes/38`],
				['gpx',`notes/38.gpx`],
				['rss',`notes/38.rss`],
			]
		)
	})
})
