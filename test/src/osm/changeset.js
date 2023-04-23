import {strict as assert} from 'assert'
import {getChangesetFromOsmApiResponse} from '../../../test-build/osm/changeset.js'

describe("osm / changeset module / toUserQuery()",()=>{
	it("reads changeset in CGImap format",()=>{
		const input={
			"version":"0.6",
			"generator":"CGImap 0.8.8 (1059099 spike-08.openstreetmap.org)",
			"copyright":"OpenStreetMap and contributors",
			"attribution":"http://www.openstreetmap.org/copyright",
			"license":"http://opendatacommons.org/licenses/odbl/1-0/",
			"elements":[
				{
					"type":"changeset",
					"id":102030405,
					"created_at":"2021-03-15T07:55:33Z",
					"closed_at":"2021-03-15T07:55:34Z",
					"open":false,
					"user":"The User",
					"uid":12345,
					"minlat":50.4444444,
					"minlon":10.4444444,
					"maxlat":51.2222222,
					"maxlon":11.2222222,
					"comments_count":0,
					"changes_count":1000,
					"tags":{"comment":"some changes","created_by":"JOSM/1.5 (17428 en)"}
				}
			]
		}
		const output=getChangesetFromOsmApiResponse(input)
		assert.equal(output.id,102030405)
		assert.equal(output.minlat,50.4444444)
		assert.equal(output.minlon,10.4444444)
		assert.equal(output.maxlat,51.2222222)
		assert.equal(output.maxlon,11.2222222)
	})
	it("reads changeset in openstreetmap-website format",()=>{
		const input={
			"version":"0.6",
			"generator":"OpenHistoricalMap server",
			"copyright":"OpenHistoricalMap and contributors",
			"attribution":"http://www.openhistoricalmap.org/copyright",
			"license":"http://opendatacommons.org/licenses/odbl/1-0/",
			"changeset":{
				"id":54321,
				"created_at":"2023-03-23T13:19:03Z",
				"open":false,
				"comments_count":0,
				"changes_count":444,
				"closed_at":"2023-03-23T13:21:33Z",
				"min_lat":50.1111111,
				"min_lon":5.1111111,
				"max_lat":50.2222222,
				"max_lon":5.2222222,
				"uid":1234,
				"user":"Another User",
				"tags":{"created_by":"JOSM/1.5 (18570 en)"}
			}
		}
		const output=getChangesetFromOsmApiResponse(input)
		assert.equal(output.id,54321)
		assert.equal(output.minlat,50.1111111)
		assert.equal(output.minlon,5.1111111)
		assert.equal(output.maxlat,50.2222222)
		assert.equal(output.maxlon,5.2222222)
	})
})
