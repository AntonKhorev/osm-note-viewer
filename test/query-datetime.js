import {strict as assert} from 'assert'
import {toReadableDateTime, toDateTimeQuery} from '../test-build/query-datetime.js'

describe("dateTime query module / toReadableDateTime()",()=>{
	it("returns blank for undefined dateTime",()=>{
		assert.equal(
			toReadableDateTime(undefined),
			''
		)
	})
	it("returns blank for invalid dateTime",()=>{
		assert.equal(
			toReadableDateTime('get lost'),
			''
		)
	})
	it("returns readable string for valid dateTime",()=>{
		assert.equal(
			toReadableDateTime('20150724T165348Z'),
			'2015-07-24 16:53:48'
		)
	})
})

describe("dateTime query module / toDateTimeQuery()",()=>{
	it("returns empty query for blank",()=>{
		const dtq=toDateTimeQuery(``)
		assert.equal(dtq.dateTimeType,'empty')
	})
	it("returns empty query for spaces",()=>{
		const dtq=toDateTimeQuery(`    `)
		assert.equal(dtq.dateTimeType,'empty')
	})
	it("returns invalid query for non-date string",()=>{
		const dtq=toDateTimeQuery(`lol`)
		assert.equal(dtq.dateTimeType,'invalid')
	})
	it("returns valid query for year",()=>{
		const dtq=toDateTimeQuery(`2016`)
		assert.equal(dtq.dateTimeType,'valid')
		assert.equal(dtq.dateTime,'20160101T000000Z')
	})
	it("returns valid query for year-month",()=>{
		const dtq=toDateTimeQuery(`2016-08`)
		assert.equal(dtq.dateTimeType,'valid')
		assert.equal(dtq.dateTime,'20160801T000000Z')
	})
	it("returns valid query for year-month-day",()=>{
		const dtq=toDateTimeQuery(`2016-08-23`)
		assert.equal(dtq.dateTimeType,'valid')
		assert.equal(dtq.dateTime,'20160823T000000Z')
	})
	it("returns valid query for year-month-day hour",()=>{
		const dtq=toDateTimeQuery(`2016-08-23 14`)
		assert.equal(dtq.dateTimeType,'valid')
		assert.equal(dtq.dateTime,'20160823T140000Z')
	})
	it("returns valid query for year-month-day hour:minute",()=>{
		const dtq=toDateTimeQuery(`2016-08-23 14:49`)
		assert.equal(dtq.dateTimeType,'valid')
		assert.equal(dtq.dateTime,'20160823T144900Z')
	})
	it("returns valid query for year-month-day hour:minute",()=>{
		const dtq=toDateTimeQuery(`2016-08-23 14:49:37`)
		assert.equal(dtq.dateTimeType,'valid')
		assert.equal(dtq.dateTime,'20160823T144937Z')
	})
	it("returns valid query for no-separator dateTime",()=>{
		const dtq=toDateTimeQuery(`20211112 123456`)
		assert.equal(dtq.dateTimeType,'valid')
		assert.equal(dtq.dateTime,'20211112T123456Z')
	})
	it("returns valid query for no-separator T+Z dateTime",()=>{
		const dtq=toDateTimeQuery(`20211113T123456Z`)
		assert.equal(dtq.dateTimeType,'valid')
		assert.equal(dtq.dateTime,'20211113T123456Z')
	})
	it("returns valid query for padded dateTime",()=>{
		const dtq=toDateTimeQuery(`  2013-09-23 14:29:37  `)
		assert.equal(dtq.dateTimeType,'valid')
		assert.equal(dtq.dateTime,'20130923T142937Z')
	})
})
