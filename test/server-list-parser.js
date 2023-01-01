import {strict as assert} from 'assert'
import parseServerListItem from '../test-build/server-list-parser.js'

describe("server list parser module",()=>{
	it("parses default config",()=>{
		const result=parseServerListItem(null)
		const [
			apiUrl,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,maxZoom,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText
		]=result
		assert.equal(webUrls[0],`https://www.openstreetmap.org/`)
		assert.notEqual(noteText,undefined)
	})
	it("parses single string config",()=>{
		const result=parseServerListItem(`https://master.apis.dev.openstreetmap.org/`)
		const [
			apiUrl,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,maxZoom,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText
		]=result
		assert.equal(webUrls[0],`https://master.apis.dev.openstreetmap.org/`)
		assert.equal(noteText,undefined)
	})
	it("parses single string note text",()=>{
		const result=parseServerListItem({
			note: `hello world`
		})
		const [
			apiUrl,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,maxZoom,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText
		]=result
		assert.equal(noteUrl,undefined)
		assert.equal(noteText,`hello world`)
	})
	it("parses single string note url",()=>{
		const result=parseServerListItem({
			note: `https://example.com/hello/`
		})
		const [
			apiUrl,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,maxZoom,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText
		]=result
		assert.equal(noteUrl,`https://example.com/hello/`)
		assert.equal(noteText,undefined)
	})
	it("parses array note text,url",()=>{
		const result=parseServerListItem({
			note: [`the end`,`https://example.com/bye/`]
		})
		const [
			apiUrl,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,maxZoom,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText
		]=result
		assert.equal(noteUrl,`https://example.com/bye/`)
		assert.equal(noteText,`the end`)
	})
})
