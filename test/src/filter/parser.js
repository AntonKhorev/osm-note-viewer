import {strict as assert} from 'assert'
import {parseFilterString} from '../../../test-build/filter/parser.js'

const assertNoUserQueryCalls=fn=>{
	let callCount=0
	const getUserQuery=()=>{
		callCount++
		return {
			type: 'name',
			username: "Surprise"
		}
	}
	fn(getUserQuery)
	assert.equal(callCount,0)
}

const assertOneUserQueryCall=(fn,expectedQueryInput,queryOutput)=>{
	let matchedCallCount=0
	let unmatchedCallCount=0
	const getUserQuery=queryInput=>{
		matchedCallCount+=queryInput==expectedQueryInput
		unmatchedCallCount+=queryInput!=expectedQueryInput
		return queryOutput
	}
	fn(getUserQuery)
	assert.equal(matchedCallCount,1)
	assert.equal(unmatchedCallCount,0)
}

describe("filter / parseFilterString()",()=>{
	it("fails on syntax error",()=>{
		assertNoUserQueryCalls(getUserQuery=>{
			assert.throws(()=>{
				parseFilterString('=',getUserQuery)
			})
		})
	})
	it("fails on invalid action",()=>{
		assertNoUserQueryCalls(getUserQuery=>{
			assert.throws(()=>{
				parseFilterString('action = fail',getUserQuery)
			})
		})
	})
	it("fails on invalid user",()=>{
		assertOneUserQueryCall(getUserQuery=>{
			assert.throws(()=>{
				parseFilterString('user = ///',getUserQuery)
			})
		}, "///", {type: 'invalid', message: 'whatever'})
	})
	it("parses empty filter",()=>{
		assertNoUserQueryCalls(getUserQuery=>{
			const statements=parseFilterString('',getUserQuery)
			assert.deepEqual(statements,[])
		})
	})
	it("parses username",()=>{
		assertOneUserQueryCall(getUserQuery=>{
			const statements=parseFilterString('user = Alice',getUserQuery)
			assert.deepEqual(statements,[
				{type: 'conditions', conditions: [
					{type: 'user', operator: '=', user: {type: 'name', username: 'Alice'}}
				]}
			])
		}, "Alice", {type: 'name', username: 'Alice'})
	})
	it("parses user url",()=>{
		assertOneUserQueryCall(getUserQuery=>{
			const statements=parseFilterString('user = https://www.openstreetmap.org/user/Alice',getUserQuery)
			assert.deepEqual(statements,[
				{type: 'conditions', conditions: [
					{type: 'user', operator: '=', user: {type: 'name', username: 'Alice'}}
				]}
			])
		}, "https://www.openstreetmap.org/user/Alice", {type: 'name', username: 'Alice'})
	})
	it("parses username and text",()=>{
		assertOneUserQueryCall(getUserQuery=>{
			const statements=parseFilterString('user = Alice, text = "boo!"',getUserQuery)
			assert.deepEqual(statements,[
				{type: 'conditions', conditions: [
					{type: 'user', operator: '=', user: {type: 'name', username: 'Alice'}},
					{type: 'text', operator: '=', text: "boo!"},
				]}
			])
		}, "Alice", {type: 'name', username: 'Alice'})
	})
})
