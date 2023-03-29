import {strict as assert} from 'assert'
import {detachValueFromHash, attachValueToFrontOfHash} from '../../../test-build/util/hash.js'

describe("hash module / detachValueFromHash()",()=>{
	it("gets nothing from an empty string",()=>{
		const [host,rest]=detachValueFromHash(`host`,``)
		assert.equal(host,null)
		assert.equal(rest,``)
	})
	it("gets rest from a string without host",()=>{
		const [host,rest]=detachValueFromHash(`host`,`no host here&no host there`)
		assert.equal(host,null)
		assert.equal(rest,`no host here&no host there`)
	})
	it("gets host and rest from a string only with host",()=>{
		const [host,rest]=detachValueFromHash(`host`,`host=nothingmore`)
		assert.equal(host,`nothingmore`)
		assert.equal(rest,``)
	})
	it("gets host and rest from a string with host",()=>{
		const [host,rest]=detachValueFromHash(`host`,`host=xyz&other stuff&more stuff`)
		assert.equal(host,`xyz`)
		assert.equal(rest,`other stuff&more stuff`)
	})
	it("gets host and rest from a string with host at the end",()=>{
		const [host,rest]=detachValueFromHash(`host`,`other things&more things&host=zyx`)
		assert.equal(host,`zyx`)
		assert.equal(rest,`other things&more things`)
	})
	it("gets host and rest from a string with host in the middle",()=>{
		const [host,rest]=detachValueFromHash(`host`,`stuff before&host=xyxyx&stuff after`)
		assert.equal(host,`xyxyx`)
		assert.equal(rest,`stuff before&stuff after`)
	})
	it("gets first host from a string with two hosts",()=>{
		const [host,rest]=detachValueFromHash(`host`,`host=one&host=two`)
		assert.equal(host,`one`)
		assert.equal(rest,`host=two`)
	})
	it("gets empty string host",()=>{
		const [host,rest]=detachValueFromHash(`host`,`host`)
		assert.equal(host,``)
		assert.equal(rest,``)
	})
	it("gets %-encoded host value",()=>{
		const [host,rest]=detachValueFromHash(`host`,`host=l%45l`)
		assert.equal(host,`lEl`)
		assert.equal(rest,``)
	})
	it("gets %-encoded host key",()=>{
		const [host,rest]=detachValueFromHash(`host`,`%68ost=yes`)
		assert.equal(host,`yes`)
		assert.equal(rest,``)
	})
})

describe("hash module / attachValueToFrontOfHash()",()=>{
	it("adds nothing when host is null",()=>{
		const hash=attachValueToFrontOfHash(`host`,null,`whatever`)
		assert.equal(hash,`whatever`)
	})
	it("adds host",()=>{
		const hash=attachValueToFrontOfHash(`host`,`something`,`whatever`)
		assert.equal(hash,`host=something&whatever`)
	})
	it("adds host without %-encoding",()=>{
		const hash=attachValueToFrontOfHash(`host`,`a/b`,`whatever`)
		assert.equal(hash,`host=a/b&whatever`)
	})
	it("adds host with %-encoding",()=>{
		const hash=attachValueToFrontOfHash(`host`,`a=b`,`whatever`)
		assert.equal(hash,`host=a%3Db&whatever`)
	})
})
