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
})
