import {strict as assert} from 'assert'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import NoteViewerDB from '../test-build/db.js'

describe("NoteViewerDB",()=>{
	const makeNote=(id)=>({id, lat:60, lon:30, status:'open', comments:[]})
	it("saves and restores data for query",async()=>{
		indexedDB=new IDBFactory()
		const db=await NoteViewerDB.open()
		const queryString='testQuery'
		const fetchEntry10=await db.getFetchWithClearedData(1001001,queryString)
		assert.deepEqual(fetchEntry10,{
			queryString,
			timestamp: 1001001,
			writeTimestamp: 1001001,
			accessTimestamp: 1001001,
		})
		const fetchEntry11=await db.addDataToFetch(1002001,fetchEntry10,
			[makeNote(101)],
			[makeNote(101)],
			{},{}
		)
		assert.deepEqual(fetchEntry11,{
			queryString,
			timestamp: 1001001,
			writeTimestamp: 1002001,
			accessTimestamp: 1002001,
		})
		const [fetchEntry20,notes,users]=await db.getFetchWithRestoredData(1003001,queryString)
		assert.deepEqual(fetchEntry20,{
			queryString,
			timestamp: 1001001,
			writeTimestamp: 1002001,
			accessTimestamp: 1003001,
		})
		assert.deepEqual(notes,
			[makeNote(101)]
		)
		assert.deepEqual(users,
			{}
		)
	})
	it("detects that fetch is stale if the query was cleared",async()=>{
		indexedDB=new IDBFactory()
		const db=await NoteViewerDB.open()
		const queryString='testQuery'
		const fetchEntry10=await db.getFetchWithClearedData(1001001,queryString)
		assert.deepEqual(fetchEntry10,{
			queryString,
			timestamp: 1001001,
			writeTimestamp: 1001001,
			accessTimestamp: 1001001,
		})
		const fetchEntry20=await db.getFetchWithClearedData(1002001,queryString)
		assert.deepEqual(fetchEntry20,{
			queryString,
			timestamp: 1002001,
			writeTimestamp: 1002001,
			accessTimestamp: 1002001,
		})
		const fetchEntry11=await db.addDataToFetch(1003001,fetchEntry10,
			[makeNote(101)],
			[makeNote(101)],
			{},{}
		)
		assert.equal(fetchEntry11,null)
	})
})
