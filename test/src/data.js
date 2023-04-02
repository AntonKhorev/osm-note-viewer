import {strict as assert} from 'assert'
import {transformFeatureCollectionToNotesAndUsers} from '../../test-build/data.js'

describe("data module",()=>{
	it("parses normal note",()=>{
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
						"html":"\u003cp\u003ethis doesn't exist\u003c/p\u003e"
					}]
				}
			}]
		}
		const [notes,users]=transformFeatureCollectionToNotesAndUsers(data)
		assert.deepEqual(notes,[{
			id: 123456,
			lat: 60,
			lon: 30,
			status: 'open',
			comments: [{
				date: Date.parse('2022-02-18T18:25:04Z')/1000,
				uid: 321,
				action: 'opened',
				text: "this doesn't exist"
			}]
		}])
	})
	it("parses empty note",()=>{
		const data={
			"type":"FeatureCollection",
			"features":[{
				"type":"Feature",
				"geometry":{
					"type":"Point",
					"coordinates":[31,61]
				},
				"properties":{
					"id":123789,
					"url":"https://api.openstreetmap.org/whatever",
					"comment_url":"https://api.openstreetmap.org/whatever",
					"close_url":"https://api.openstreetmap.org/whatever",
					"date_created":"2022-03-18 18:25:04 UTC",
					"status":"open",
					"comments":[]
				}
			}]
		}
		const [notes,users]=transformFeatureCollectionToNotesAndUsers(data)
		assert.deepEqual(notes,[{
			id: 123789,
			lat: 61,
			lon: 31,
			status: 'open',
			comments: [{
				date: Date.parse('2022-03-18T18:25:04Z')/1000,
				action: 'opened',
				text: "",
				guessed: true
			}]
		}])
	})
	it("parses note with first non-opening comment",()=>{
		const data={
			"type":"FeatureCollection",
			"features":[{
				"type":"Feature",
				"geometry":{
					"type":"Point",
					"coordinates":[32,62]
				},
				"properties":{
					"id":654321,
					"url":"https://api.openstreetmap.org/whatever",
					"comment_url":"https://api.openstreetmap.org/whatever",
					"close_url":"https://api.openstreetmap.org/whatever",
					"date_created":"2022-04-18 18:25:04 UTC",
					"status":"open",
					"comments":[{
						"date":"2022-05-18 18:25:04 UTC",
						"uid":321,
						"user":"SomeUser",
						"user_url":"https://api.openstreetmap.org/whatever",
						"action":"commented",
						"text":"what?",
						"html":"\u003cp\u003ewhat?\u003c/p\u003e"
					}]
				}
			}]
		}
		const [notes,users]=transformFeatureCollectionToNotesAndUsers(data)
		assert.deepEqual(notes,[{
			id: 654321,
			lat: 62,
			lon: 32,
			status: 'open',
			comments: [{
				date: Date.parse('2022-04-18T18:25:04Z')/1000,
				action: 'opened',
				text: "",
				guessed: true
			},{
				date: Date.parse('2022-05-18T18:25:04Z')/1000,
				uid: 321,
				action: 'commented',
				text: "what?"
			}]
		}])
	})
})
