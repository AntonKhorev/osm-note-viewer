import {strict as assert} from 'assert'
import getCommentItems from '../test-build/comment.js'

function run(...lines) {
	return getCommentItems(
		lines.join('\n')
	)
}

describe("getCommentItems",()=>{
	it("parses two image links",()=>{
		const result=run(
			`Some thing`,
			``,
			`via StreetComplete 40.0`,
			``,
			`Attached photo(s):`,
			`https://westnordost.de/p/123.jpg`,
			`https://westnordost.de/p/456.jpg`
		)
		assert.deepEqual(result,[
			{type:'text',text:`Some thing\n\nvia StreetComplete 40.0\n\nAttached photo(s):\n`},
			{type:'link',link:'image',text:`https://westnordost.de/p/123.jpg`,href:`https://westnordost.de/p/123.jpg`},
			{type:'text',text:`\n`},
			{type:'link',link:'image',text:`https://westnordost.de/p/456.jpg`,href:`https://westnordost.de/p/456.jpg`},
		])
	})
	it("parses osm.org link",()=>{
		const result=run(
			`Unable to answer "What’s the surface of the sidewalk here?" for https://osm.org/way/123456 via StreetComplete 42.0`
		)
		assert.deepEqual(result,[
			{type:'text',text:`Unable to answer "What’s the surface of the sidewalk here?" for `},
			{
				type:'link',link:'osm',osm:'element',
				text:`https://osm.org/way/123456`,
				href:`https://www.openstreetmap.org/way/123456`,
				map:undefined
			},
			{type:'text',text:` via StreetComplete 42.0`},
		])
	})
	it("parses note link",()=>{
		const result=run(
			`Note en double (https://www.openstreetmap.org/note/32123).`,
			`Si vous voulez l'ajouter ...`
		)
		assert.deepEqual(result,[
			{type:'text',text:`Note en double (`},
			{
				type:'link',link:'osm',osm:'note',
				text:`https://www.openstreetmap.org/note/32123`,
				href:`https://www.openstreetmap.org/note/32123`,
				id:32123,map:undefined
			},
			{type:'text',text:`).\nSi vous voulez l'ajouter ...`},
		])
	})
	it("parses osm root link with map parameter",()=>{
		const result=run(
			`https://www.openstreetmap.org/#map=11/59.9444/30.2914&layers=N`
		)
		assert.deepEqual(result,[
			{
				type:'link',link:'osm',osm:'root',
				text:`https://www.openstreetmap.org/#map=11/59.9444/30.2914&layers=N`,
				href:`https://www.openstreetmap.org/#map=11/59.9444/30.2914&layers=N`,
				map: [11,59.9444,30.2914]
			}
		])
	})
	it("parses timestamped mapsme comment",()=>{
		const result=run(
			`"Cheap rides - buses baratos"`,
			`POI name: Bus Whatever Name`,
			`POI types: highway-bus_stop`,
			`OSM data version: 2021-05-24T07:43:34Z`,
			` #mapsme`
		)
		assert.deepEqual(result,[
			{type:'text',text:`"Cheap rides - buses baratos"\nPOI name: Bus Whatever Name\nPOI types: highway-bus_stop\nOSM data version: `},
			{type:'date',text:`2021-05-24T07:43:34Z`},
			{type:'text',text:`\n #mapsme`},
		])
	})
	it("parses timestamp followed by link",()=>{
		const result=run(
			`2021-06-24T07:43:34Z + https://www.openstreetmap.org/node/1`
		)
		assert.deepEqual(result,[
			{type:'date',text:`2021-06-24T07:43:34Z`},
			{type:'text',text:` + `},
			{
				type:'link',link:'osm',osm:'element',
				text:`https://www.openstreetmap.org/node/1`,
				href:`https://www.openstreetmap.org/node/1`,
				map:undefined
			},
		])
	})
	it("parses link followed by timestamp",()=>{
		const result=run(
			`https://www.openstreetmap.org/node/1 + 2021-07-24T07:43:34Z`
		)
		assert.deepEqual(result,[
			{
				type:'link',link:'osm',osm:'element',
				text:`https://www.openstreetmap.org/node/1`,
				href:`https://www.openstreetmap.org/node/1`,
				map:undefined
			},
			{type:'text',text:` + `},
			{type:'date',text:`2021-07-24T07:43:34Z`},
		])
	})
	it("treats wiki links as text",()=>{
		const result=run(
			`Mayroón ring  mga online channels ang mga boluntaryong lokal sa OSM : https://osm.org/wiki/PH`
		)
		assert.deepEqual(result,[
			{type:'text',text:`Mayroón ring  mga online channels ang mga boluntaryong lokal sa OSM : https://osm.org/wiki/PH`},
		])
	})
})
