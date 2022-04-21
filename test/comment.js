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
			{type:'link',link:'osm',osm:'element',text:`https://osm.org/way/123456`,href:`https://www.openstreetmap.org/way/123456`},
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
			{type:'link',link:'osm',osm:'note',text:`https://www.openstreetmap.org/note/32123`,href:`https://www.openstreetmap.org/note/32123`,id:32123},
			{type:'text',text:`).\nSi vous voulez l'ajouter ...`},
		])
	})
})
