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

describe("filter / parseFilterString()",()=>{
	it("fails on syntax error",()=>assertNoUserQueryCalls(getUserQuery=>{
		assert.throws(()=>{
			parseFilterString('=',getUserQuery)
		})
	}))
	it("fails on invalid action",()=>assertNoUserQueryCalls(getUserQuery=>{
		assert.throws(()=>{
			parseFilterString('action = fail',getUserQuery)
		})
	}))
})
