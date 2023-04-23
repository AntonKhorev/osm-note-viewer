import {strict as assert} from 'assert'
import getCommentItems from '../../test-build/comment.js'

class WebUrlLister {
	constructor(urls) {
		this.urls=urls
		this.getUrl=webPath=>`${urls[0]}${webPath}`
	}
}

const defaultWebUrlLister=new WebUrlLister([
	`https://www.openstreetmap.org/`,
	`https://openstreetmap.org/`,
	`https://www.osm.org/`,
	`https://osm.org/`,
])

const defaultImageSourceUrls=[
	`https://westnordost.de/p/`
]

function runCustom(webLister,imageSourceUrls,...lines) {
	return getCommentItems(
		webLister??defaultWebUrlLister,
		imageSourceUrls??defaultImageSourceUrls,
		lines.join('\n')
	)
}
function run(...lines) {
	return runCustom(defaultWebUrlLister,defaultImageSourceUrls,...lines)
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
				element:'way',id:123456,map:undefined
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
				map:['11','59.9444','30.2914']
			}
		])
	})
	it("parses osm root link with map parameter with negative coord",()=>{
		const result=run(
			`https://www.openstreetmap.org/#map=15/-17.5344/177.6847`
		)
		assert.deepEqual(result,[
			{
				type:'link',link:'osm',osm:'root',
				text:`https://www.openstreetmap.org/#map=15/-17.5344/177.6847`,
				href:`https://www.openstreetmap.org/#map=15/-17.5344/177.6847`,
				map:['15','-17.5344','177.6847']
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
				element:'node',id:1,map:undefined
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
				element:'node',id:1,map:undefined
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
	it("parses http links",()=>{
		const result=run(
			`http://osm.org/way/123456`
		)
		assert.deepEqual(result,[
			{
				type:'link',link:'osm',osm:'element',
				text:`http://osm.org/way/123456`,
				href:`https://www.openstreetmap.org/way/123456`,
				element:'way',id:123456,map:undefined
			}
		])
	})
	it("parses custom server links",()=>{
		const result=runCustom(
			new WebUrlLister([
				`https://www.openhistoricalmap.org/`,
				`https://openhistoricalmap.org/`
			]),
			null,
			`https://openhistoricalmap.org/node/2094245998`
		)
		assert.deepEqual(result,[
			{
				type:'link',link:'osm',osm:'element',
				text:`https://openhistoricalmap.org/node/2094245998`,
				href:`https://www.openhistoricalmap.org/node/2094245998`,
				element:'node',id:2094245998,map:undefined
			}
		])
	})
	it("parses rails dev server links",()=>{
		const result=runCustom(
			new WebUrlLister([
				`http://127.0.0.1:3000/`
			]),
			null,
			`http://127.0.0.1:3000/node/49`
		)
		assert.deepEqual(result,[
			{
				type:'link',link:'osm',osm:'element',
				text:`http://127.0.0.1:3000/node/49`,
				href:`http://127.0.0.1:3000/node/49`,
				element:'node',id:49,map:undefined
			}
		])
	})
	it("parses custom image links",()=>{
		const result=runCustom(
			null,
			[
				`https://i.imgur.com/`,
				`https://cdn.masto.host/enosmtown/`,
			],
			`https://cdn.masto.host/enosmtown/media_attachments/files/111/222/333/444/555/666/original/abcdefghijklmnop.jpg`
		)
		assert.deepEqual(result,[
			{
				type:'link',link:'image',
				text:`https://cdn.masto.host/enosmtown/media_attachments/files/111/222/333/444/555/666/original/abcdefghijklmnop.jpg`,
				href:`https://cdn.masto.host/enosmtown/media_attachments/files/111/222/333/444/555/666/original/abcdefghijklmnop.jpg`
			}
		])
	})
	it("skips image links when custom images are disabled",()=>{
		const result=runCustom(
			null,
			[],
			`https://westnordost.de/p/123.jpg`
		)
		assert.deepEqual(result,[
			{
				type:'text',
				text:`https://westnordost.de/p/123.jpg`,
			}
		])
	})
})
