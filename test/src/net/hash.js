import {strict as assert} from 'assert'
import {splitHostFromHash} from '../../../test-build/net/hash.js'

describe("hash module / splitHostFromHash()",()=>{
	it("gets nothing from an empty string",()=>{
		const [host,rest]=splitHostFromHash(``)
		assert.equal(host,null)
		assert.equal(rest,``)
	})
	it("gets rest from a string without host",()=>{
		const [host,rest]=splitHostFromHash(`no host here&no host there`)
		assert.equal(host,null)
		assert.equal(rest,`no host here&no host there`)
	})
	it("gets host and rest from a string only with host",()=>{
		const [host,rest]=splitHostFromHash(`host=nothingmore`)
		assert.equal(host,`nothingmore`)
		assert.equal(rest,``)
	})
	it("gets host and rest from a string with host",()=>{
		const [host,rest]=splitHostFromHash(`host=xyz&other stuff&more stuff`)
		assert.equal(host,`xyz`)
		assert.equal(rest,`other stuff&more stuff`)
	})
	it("gets host and rest from a string with host at the end",()=>{
		const [host,rest]=splitHostFromHash(`other things&more things&host=zyx`)
		assert.equal(host,`zyx`)
		assert.equal(rest,`other things&more things`)
	})
	it("gets host and rest from a string with host in the middle",()=>{
		const [host,rest]=splitHostFromHash(`stuff before&host=xyxyx&stuff after`)
		assert.equal(host,`xyxyx`)
		assert.equal(rest,`stuff before&stuff after`)
	})
	it("gets first host from a string with two hosts",()=>{
		const [host,rest]=splitHostFromHash(`host=one&host=two`)
		assert.equal(host,`one`)
		assert.equal(rest,`host=two`)
	})
	it("gets empty string host",()=>{
		const [host,rest]=splitHostFromHash(`host`)
		assert.equal(host,``)
		assert.equal(rest,``)
	})
	it("gets %-encoded host value",()=>{
		const [host,rest]=splitHostFromHash(`host=l%45l`)
		assert.equal(host,`lEl`)
		assert.equal(rest,``)
	})
	it("gets %-encoded host key",()=>{
		const [host,rest]=splitHostFromHash(`%68ost=yes`)
		assert.equal(host,`yes`)
		assert.equal(rest,``)
	})
})
