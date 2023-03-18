import {strict as assert} from 'assert'
import compareKeys from '../../../test-build/map/popup-key-compare.js'

describe("compareKeys",()=>{
	it("compares equal keys",()=>{
		assert(
			compareKeys('foo','foo') == 0
		)
	})
	it("compares different keys a<b",()=>{
		assert(
			compareKeys('aabcddd','eefg') < 0
		)
	})
	it("compares different keys b>a",()=>{
		assert(
			compareKeys('vvqqwewe','eefg') > 0
		)
	})
	it("compares keys with one lifecycle prefix",()=>{
		assert(
			compareKeys('shop','disused:shop') < 0
		)
	})
	it("compares keys with one lifecycle prefix of different keys",()=>{
		assert(
			compareKeys('shoppe','disused:shop') > 0
		)
	})
	it("compares keys with two lifecycle prefixes",()=>{
		assert(
			compareKeys('abandoned:shop','disused:shop') < 0
		)
	})
})
