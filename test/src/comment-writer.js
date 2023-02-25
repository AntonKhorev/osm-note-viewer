import {strict as assert} from 'assert'
import {JSDOM} from 'jsdom'

import CommentWriter from '../../test-build/comment-writer.js'

describe("CommentWriter",()=>{
	beforeEach(function(){
		const jsdom=new JSDOM()
		this.window=jsdom.window
		global.document=jsdom.window.document
	})
	it("writes links",function(){
		const commentWriter=new CommentWriter({
			web: {
				urls: [`https://osmtest.example.com/`],
				getUrl: webPath=>`https://osmtest.example.com/`+webPath
			}
		})
		const [inlines,images]=commentWriter.makeCommentElements(`https://osmtest.example.com/changeset/133024245`)
		assert.deepEqual(images,[])
		assert.equal(inlines.length,1)
		const [$a]=inlines
		assert.equal($a instanceof this.window.HTMLAnchorElement,true)
		assert.equal($a.href,`https://osmtest.example.com/changeset/133024245`)
	})
})
