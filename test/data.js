import {strict as assert} from 'assert'
import {transformFeatureCollectionToNotesAndUsers} from '../test-build/data.js'

describe("data module",()=>{
	it("parses date",()=>{
		const data={
			"type":"FeatureCollection",
			"features":[{
				"type":"Feature",
				"geometry":{
					"type":"Point",
					"coordinates":[30,60]
				},
				"properties":{
					"id":123456,
					"url":"https://api.openstreetmap.org/whatever",
					"comment_url":"https://api.openstreetmap.org/whatever",
					"close_url":"https://api.openstreetmap.org/whatever",
					"date_created":"2022-02-18 18:25:04 UTC",
					"status":"open",
					"comments":[{
						"date":"2022-02-18 18:25:04 UTC",
						"uid":321,
						"user":"SomeUser",
						"user_url":"https://api.openstreetmap.org/whatever",
						"action":"opened",
						"text":"this doesn't exist",
						"html":"\u003cp\u003ethis doesn't exist\u003c/p\u003e"}]
					}
			}]
		}
		const [notes,users]=transformFeatureCollectionToNotesAndUsers(data)
		const date=notes[0].comments[0].date
		const dateString=new Date(date*1000).toISOString()
		assert.equal(dateString,'2022-02-18T18:25:04.000Z')
	})
})
