import {strict as assert} from 'assert'
import {getChangesetFromOsmApiResponse} from '../../../test-build/osm/changeset.js'

describe("osm / changeset module / toUserQuery()",()=>{
	it("reads changeset wrapped in elements array",()=>{
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
					"minlat":50,
					"minlon":10,
					"maxlat":51,
					"maxlon":11,
					"comments_count":0,
					"changes_count":1000,
					"tags":{"comment":"some changes","created_by":"JOSM/1.5 (17428 en)"}
				}
			]
		}
		const output=getChangesetFromOsmApiResponse(input)
		assert.equal(output.id,102030405)
	})
})
