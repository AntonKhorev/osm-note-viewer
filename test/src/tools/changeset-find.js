import {strict as assert} from 'assert'
import {findClosingChangesetId} from '../../../test-build/tools/changeset-find.js'

describe("find closing changeset",()=>{
	it("before target timestamp",()=>{
		const changesets=[{
			"id":320782,
			"created_at":"2021-03-05T11:17:53Z",
			"closed_at":"2021-03-05T11:17:55Z",
		},{
			"id":318160,
			"created_at":"2021-03-05T09:49:20Z",
			"closed_at":"2021-03-05T09:49:21Z",
		},{
			"id":301848,
			"created_at":"2021-03-04T18:32:22Z",
			"closed_at":"2021-03-04T18:32:23Z",
		},{
			"id":301199,
			"created_at":"2021-03-04T18:09:54Z",
			"closed_at":"2021-03-04T18:09:55Z",
		},{
			"id":299204,
			"created_at":"2021-03-04T17:19:55Z",
			"closed_at":"2021-03-04T17:19:56Z",
		},{
			"id":295351,
			"created_at":"2021-03-04T15:44:08Z",
			"closed_at":"2021-03-04T15:44:09Z",
		},{
			"id":295043,
			"created_at":"2021-03-04T15:36:12Z",
			"closed_at":"2021-03-04T15:36:12Z",
		},{
			"id":290919,
			"created_at":"2021-03-04T13:50:56Z",
			"closed_at":"2021-03-04T13:50:57Z",
		},{
			"id":289414,
			"created_at":"2021-03-04T13:13:32Z",
			"closed_at":"2021-03-04T13:13:33Z",
		},{
			"id":283630,
			"created_at":"2021-03-04T10:21:52Z",
			"closed_at":"2021-03-04T10:21:53Z",
		},{
			"id":261951,
			"created_at":"2021-03-03T16:44:54Z",
			"closed_at":"2021-03-03T16:44:55Z",
		}]
		const id=findClosingChangesetId(1614872174,changesets)
		assert.equal(id,295043)
	})
	it("after target timestamp",()=>{
		const changesets=[{
			"id":9186,
			"created_at":"2020-02-19T08:35:05Z",
			"closed_at":"2020-02-19T08:35:06Z",
		},{
			"id":7895,
			"created_at":"2020-02-19T07:42:22Z",
			"closed_at":"2020-02-19T07:42:23Z",
		},{
			"id":3573,
			"created_at":"2020-02-19T01:25:19Z",
			"closed_at":"2020-02-19T01:25:20Z",
		}]
		const id=findClosingChangesetId(1582097279,changesets)
		assert.equal(id,7895)
	})
})
