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
			{type:'image',text:`https://westnordost.de/p/123.jpg`,href:`https://westnordost.de/p/123.jpg`},
			{type:'text',text:`\n`},
			{type:'image',text:`https://westnordost.de/p/456.jpg`,href:`https://westnordost.de/p/456.jpg`},
		])
	})
})
