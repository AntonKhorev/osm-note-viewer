import {strict as assert} from 'assert'
import makeProgressiveDate from '../../test-build/progressive-date.js'

describe("makeProgressiveDate()",()=>{
	it("makes date within one day",()=>{
		const result=makeProgressiveDate(
			new Date('2021-02-03T12:34:56Z'),
			new Date('2021-02-04T10:30:50Z')
		)
		assert.deepEqual(result,[
			['2021-02-03 ',2],
			['12:34',0],
			[':56',1],
		])
	})
	it("makes date within one year",()=>{
		const result=makeProgressiveDate(
			new Date('2021-02-03T12:34:56Z'),
			new Date('2021-02-04T13:30:50Z')
		)
		assert.deepEqual(result,[
			['2021-',1],
			['02-03',0],
			[' 12:34:56',2],
		])
	})
	it("makes date outside one year",()=>{
		const result=makeProgressiveDate(
			new Date('2021-02-03T12:34:56Z'),
			new Date('2022-02-04T13:30:50Z')
		)
		assert.deepEqual(result,[
			['2021',0],
			['-02-03',1],
			[' 12:34:56',2],
		])
	})
})
