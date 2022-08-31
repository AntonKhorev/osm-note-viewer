import {strict as assert} from 'assert'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import NoteViewerDB from '../test-build/db.js'

describe("NoteViewerDB",()=>{
	it("saves and restores data for query",async()=>{
		indexedDB=new IDBFactory()
		const db=await NoteViewerDB.open()
		const queryString='testQuery'
		const fetchEntry1=await db.getFetchWithClearedData(1001001,queryString)
		assert.deepEqual(fetchEntry1,{
			queryString,
			timestamp: 1001001,
			writeTimestamp: 1001001,
			accessTimestamp: 1001001,
		})
		const saved=await db.addDataToFetch(1002001,fetchEntry1,
			[{id:101, lat:60, lon:30, status:'open', comments:[]}],
			[{id:101, lat:60, lon:30, status:'open', comments:[]}],
			{},{}
		)
		assert.equal(saved,true)
		const [fetchEntry2,notes,users]=await db.getFetchWithRestoredData(1003001,queryString)
		assert.deepEqual(fetchEntry2,{
			queryString,
			timestamp: 1001001,
			writeTimestamp: 1002001,
			accessTimestamp: 1003001,
		})
		assert.deepEqual(notes,
			[{id:101, lat:60, lon:30, status:'open', comments:[]}]
		)
		assert.deepEqual(users,
			{}
		)
	})
})
