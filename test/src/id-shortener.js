import {strict as assert} from 'assert'
import IdShortener from '../../test-build/id-shortener.js'

describe("IdShortener",()=>{
	it("doesn't shorten single id",()=>{
		const shortener=new IdShortener()
		assert.equal(
			shortener.scan('123'),
			false
		)
		assert.deepEqual(
			shortener.split('123'),
			['','123']
		)
	})
	it("doesn't shorten ids with different lengths",()=>{
		const shortener=new IdShortener()
		assert.equal(
			shortener.scan('123'),
			false
		)
		assert.equal(
			shortener.scan('4567'),
			true
		)
		assert.deepEqual(
			shortener.split('123'),
			['','123']
		)
		assert.deepEqual(
			shortener.split('4567'),
			['','4567']
		)
		assert.deepEqual(
			shortener.split('89'),
			['','89']
		)
	})
	it("shortens ids with some varying digits",()=>{
		const shortener=new IdShortener()
		assert.equal(
			shortener.scan('12345'),
			false
		)
		assert.equal(
			shortener.scan('12348'),
			false
		)
		assert.equal(
			shortener.scan('12351'),
			false
		)
		assert.deepEqual(
			shortener.split('12345'),
			['123','45']
		)
		assert.deepEqual(
			shortener.split('12348'),
			['123','48']
		)
		assert.deepEqual(
			shortener.split('12351'),
			['123','51']
		)
	})
})
