import {strict as assert} from 'assert'
import {toReadableDate, toDateQuery} from '../../test-build/query-date.js'

describe("date query module / toReadableDate()",()=>{
	it("returns blank for undefined date",()=>{
		assert.equal(
			toReadableDate(undefined),
			''
		)
	})
	it("returns readable string for valid date",()=>{
		assert.equal(
			toReadableDate(makeDate('2015-07-24 16:53:48Z')),
			'2015-07-24 16:53:48'
		)
	})
})

describe("date query module / toDateQuery()",()=>{
	it("returns empty query for blank",()=>{
		const dq=toDateQuery(``)
		assert.equal(dq.dateType,'empty')
	})
	it("returns empty query for spaces",()=>{
		const dq=toDateQuery(`    `)
		assert.equal(dq.dateType,'empty')
	})
	it("returns invalid query for non-date string",()=>{
		const dq=toDateQuery(`lol`)
		assert.equal(dq.dateType,'invalid')
	})
	it("returns valid query for year",()=>{
		const dq=toDateQuery(`2016`)
		assert.equal(dq.dateType,'valid')
		assert.equal(dq.date,makeDate('2016-01-01 00:00:00Z'))
	})
	it("returns valid query for year-month",()=>{
		const dq=toDateQuery(`2016-08`)
		assert.equal(dq.dateType,'valid')
		assert.equal(dq.date,makeDate('2016-08-01 00:00:00Z'))
	})
	it("returns valid query for year-month-day",()=>{
		const dq=toDateQuery(`2016-08-23`)
		assert.equal(dq.dateType,'valid')
		assert.equal(dq.date,makeDate('2016-08-23 00:00:00Z'))
	})
	it("returns valid query for year-month-day hour",()=>{
		const dq=toDateQuery(`2016-08-23 14`)
		assert.equal(dq.dateType,'valid')
		assert.equal(dq.date,makeDate('2016-08-23 14:00:00Z'))
	})
	it("returns valid query for year-month-day hour:minute",()=>{
		const dq=toDateQuery(`2016-08-23 14:49`)
		assert.equal(dq.dateType,'valid')
		assert.equal(dq.date,makeDate('2016-08-23 14:49:00Z'))
	})
	it("returns valid query for year-month-day hour:minute",()=>{
		const dq=toDateQuery(`2016-08-23 14:49:37`)
		assert.equal(dq.dateType,'valid')
		assert.equal(dq.date,makeDate('2016-08-23 14:49:37Z'))
	})
	it("returns valid query for no-separator date",()=>{
		const dq=toDateQuery(`20211112 123456`)
		assert.equal(dq.dateType,'valid')
		assert.equal(dq.date,makeDate('2021-11-12 12:34:56Z'))
	})
	it("returns valid query for no-separator T+Z date",()=>{
		const dq=toDateQuery(`20211113T123456Z`)
		assert.equal(dq.dateType,'valid')
		assert.equal(dq.date,makeDate('2021-11-13 12:34:56Z'))
	})
	it("returns valid query for padded date",()=>{
		const dq=toDateQuery(`  2013-09-23 14:29:37  `)
		assert.equal(dq.dateType,'valid')
		assert.equal(dq.date,makeDate('2013-09-23 14:29:37Z'))
	})
})

function makeDate(s) {
	return Date.parse(s)/1000
}
