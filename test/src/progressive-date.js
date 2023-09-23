import {strict as assert} from 'assert'
import makeProgressiveDate from '../../test-build/progressive-date.js'

describe("makeProgressiveDate()",()=>{
	it("makes date within one day",()=>{
		const result=makeProgressiveDate(
			new Date('2021-02-03T12:34:56Z'),
			new Date('2021-02-04T10:30:50Z')
		)
		assert.deepEqual(result,[
			'2021-02-03 ',[['12:34'],':56']
		])
	})
	it("makes date within one year",()=>{
		const result=makeProgressiveDate(
			new Date('2021-02-03T12:34:56Z'),
			new Date('2021-02-04T13:30:50Z')
		)
		assert.deepEqual(result,[
			['2021-',['02-03']],' 12:34:56'
		])
	})
	it("makes date outside one year",()=>{
		const result=makeProgressiveDate(
			new Date('2021-02-03T12:34:56Z'),
			new Date('2022-02-04T13:30:50Z')
		)
		assert.deepEqual(result,[
			[['2021'],'-02-03'],' 12:34:56'
		])
	})
})
