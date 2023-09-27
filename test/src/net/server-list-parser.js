import {strict as assert} from 'assert'
import {parseServerListItem} from '../../../test-build/net/server-list-parser.js'

describe("server list parser module / parseServerListItem()",()=>{
	it("parses default config",()=>{
		const result=parseServerListItem(null)
		const [
			host,apiUrl,apiNoteSearchBbox,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,tileMaxZoom,tileOwner,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText,world
		]=result
		assert.equal(webUrls[0],`https://www.openstreetmap.org/`)
		assert.notEqual(nominatimUrl,undefined)
		assert.notEqual(overpassUrl,undefined)
		assert.notEqual(noteText,undefined)
		assert.equal(world,`earth`)
	})
	it("parses single string config",()=>{
		const result=parseServerListItem(`https://master.apis.dev.openstreetmap.org/`)
		const [
			host,apiUrl,apiNoteSearchBbox,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,tileMaxZoom,tileOwner,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText,world
		]=result
		assert.equal(webUrls[0],`https://master.apis.dev.openstreetmap.org/`)
		assert.equal(nominatimUrl,undefined)
		assert.equal(overpassUrl,undefined)
		assert.equal(noteText,undefined)
	})
	it("parses single string config without final '/'",()=>{
		const result=parseServerListItem(`https://master.apis.dev.openstreetmap.org`)
		const [
			host,apiUrl,apiNoteSearchBbox,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,tileMaxZoom,tileOwner,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText,world
		]=result
		assert.equal(webUrls[0],`https://master.apis.dev.openstreetmap.org/`)
	})
	it("parses single api string",()=>{
		const result=parseServerListItem({
			web: `https://www.example.org/`,
			api: `https://api.example.org/`,
		})
		const [
			host,apiUrl,apiNoteSearchBbox,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,tileMaxZoom,tileOwner,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText,world
		]=result
		assert.equal(webUrls[0],`https://www.example.org/`)
		assert.equal(apiUrl,`https://api.example.org/`)
		assert.equal(apiNoteSearchBbox,false)
	})
	it("parses api object with no note search",()=>{
		const result=parseServerListItem({
			web: `https://www.example.org/`,
			api: {
				url: `https://api.example.org/`,
				noteSearchBbox: false,
			},
		})
		const [
			host,apiUrl,apiNoteSearchBbox,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,tileMaxZoom,tileOwner,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText,world
		]=result
		assert.equal(webUrls[0],`https://www.example.org/`)
		assert.equal(apiUrl,`https://api.example.org/`)
		assert.equal(apiNoteSearchBbox,false)
	})
	it("parses api object with note search",()=>{
		const result=parseServerListItem({
			web: `https://www.example.org/`,
			api: {
				url: `https://api.example.org/`,
				noteSearchBbox: true,
			},
		})
		const [
			host,apiUrl,apiNoteSearchBbox,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,tileMaxZoom,tileOwner,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText,world
		]=result
		assert.equal(webUrls[0],`https://www.example.org/`)
		assert.equal(apiUrl,`https://api.example.org/`)
		assert.equal(apiNoteSearchBbox,true)
	})
	it("parses single string note text",()=>{
		const result=parseServerListItem({
			web: `https://api06.dev.openstreetmap.org/`,
			note: `hello world`
		})
		const [
			host,apiUrl,apiNoteSearchBbox,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,tileMaxZoom,tileOwner,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText,world
		]=result
		assert.equal(noteUrl,undefined)
		assert.equal(noteText,`hello world`)
	})
	it("parses single string note url",()=>{
		const result=parseServerListItem({
			web: `https://api06.dev.openstreetmap.org/`,
			note: `https://example.com/hello/`
		})
		const [
			host,apiUrl,apiNoteSearchBbox,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,tileMaxZoom,tileOwner,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText,world
		]=result
		assert.equal(noteUrl,`https://example.com/hello/`)
		assert.equal(noteText,undefined)
	})
	it("parses array note text,url",()=>{
		const result=parseServerListItem({
			web: `https://api06.dev.openstreetmap.org/`,
			note: [`the end`,`https://example.com/bye/`]
		})
		const [
			host,apiUrl,apiNoteSearchBbox,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,tileMaxZoom,tileOwner,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText,world
		]=result
		assert.equal(noteUrl,`https://example.com/bye/`)
		assert.equal(noteText,`the end`)
	})
	it("parses single string tiles attrubution text and derived attribution url",()=>{
		const result=parseServerListItem({
			web: `https://opengeofiction.net/`,
			tiles: {
				attribution: `OpenGeofiction and contributors`
			}
		})
		const [
			host,apiUrl,apiNoteSearchBbox,webUrls,
			tileUrlTemplate,tileAttributionUrl,tileAttributionText,tileMaxZoom,tileOwner,
			nominatimUrl,overpassUrl,overpassTurboUrl,
			noteUrl,noteText,world
		]=result
		assert.equal(tileAttributionUrl,`https://opengeofiction.net/copyright`)
		assert.equal(tileAttributionText,`OpenGeofiction and contributors`)
	})
	it("throws on single number input",()=>{
		assert.throws(()=>{
			parseServerListItem(23)
		},/number/)
	})
	it("throws on number as web property",()=>{
		assert.throws(()=>{
			parseServerListItem({web:42})
		},/web.*number/)
	})
	it("throws on non-url string as api property",()=>{
		assert.throws(()=>{
			parseServerListItem({
				web: `https://api06.dev.openstreetmap.org/`,
				api: `wr0ng`
			})
		},/api.*wr0ng/)
	})
	it("throws on null as note property",()=>{
		assert.throws(()=>{
			parseServerListItem({
				web: `https://api06.dev.openstreetmap.org/`,
				note: null
			})
		},/note.*null/)
	})
	it("throws on [true] as note property",()=>{
		assert.throws(()=>{
			parseServerListItem({
				web: `https://api06.dev.openstreetmap.org/`,
				note: [true]
			})
		},/note.*boolean/)
	})
	it("throws on missing web property",()=>{
		assert.throws(()=>{
			parseServerListItem({})
		},/web/)
	})
})
