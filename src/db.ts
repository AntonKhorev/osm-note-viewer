import type {Note, Users} from './data'

interface NoteEntry {
	fetchTimestamp: number
	note: Note
	sequenceNumber: number
}

interface UserEntry {
	fetchTimestamp: number
	user: {
		id: number
		name: string
	}
}

export interface FetchEntry {
	queryString: string
	timestamp: number
	writeTimestamp: number
	accessTimestamp: number
}

export default class NoteViewerDB {
	private closed: boolean = false
	constructor(private idb: IDBDatabase) {
		idb.onversionchange=()=>{
			idb.close()
			this.closed=true
		}
	}
	listFetches(): Promise<FetchEntry[]> {
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['fetches'],'readonly')
			tx.onerror=()=>reject(new Error(`Database view error: ${tx.error}`))
			const request=tx.objectStore('fetches').index('access').getAll()
			request.onsuccess=()=>resolve(request.result)
		})
	}
	deleteFetch(fetch: FetchEntry): Promise<void> {
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['fetches','notes','users'],'readwrite')
			tx.onerror=()=>reject(new Error(`Database delete error: ${tx.error}`))
			tx.oncomplete=()=>resolve()
			const range=makeTimestampRange(fetch.timestamp)
			tx.objectStore('notes').delete(range)
			tx.objectStore('users').delete(range)
			tx.objectStore('fetches').delete(fetch.timestamp)
		})
	}
	getFetchWithClearedData(timestamp: number, queryString: string): Promise<FetchEntry> {
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['fetches','notes','users'],'readwrite')
			tx.onerror=()=>reject(new Error(`Database clear error: ${tx.error}`))
			cleanupOutdatedFetches(timestamp,tx)
			const fetchStore=tx.objectStore('fetches')
			const fetchRequest=fetchStore.index('query').getKey(queryString)
			fetchRequest.onsuccess=()=>{
				if (typeof fetchRequest.result == 'number') {
					const existingFetchTimestamp: number = fetchRequest.result
					const range=makeTimestampRange(existingFetchTimestamp)
					tx.objectStore('notes').delete(range)
					tx.objectStore('users').delete(range)
					fetchStore.delete(existingFetchTimestamp)
				}
				const fetch: FetchEntry = {
					queryString,
					timestamp,
					writeTimestamp: timestamp,
					accessTimestamp: timestamp
				}
				fetchStore.put(fetch).onsuccess=()=>resolve(fetch)
			}
		})
	}
	getFetchWithRestoredData(timestamp: number, queryString: string): Promise<[fetch: FetchEntry, notes: Note[], users: Users]> {
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['fetches','notes','users'],'readwrite')
			tx.onerror=()=>reject(new Error(`Database read error: ${tx.error}`))
			cleanupOutdatedFetches(timestamp,tx)
			const fetchStore=tx.objectStore('fetches')
			const fetchRequest=fetchStore.index('query').get(queryString)
			fetchRequest.onsuccess=()=>{
				if (fetchRequest.result==null) {
					const fetch: FetchEntry = {
						queryString,
						timestamp,
						writeTimestamp: timestamp,
						accessTimestamp: timestamp
					}
					fetchStore.put(fetch).onsuccess=()=>resolve([fetch,[],{}])
				} else {
					const fetch: FetchEntry = fetchRequest.result
					fetch.accessTimestamp=timestamp
					fetchStore.put(fetch)
					readNotesAndUsersInTx(fetch.timestamp,tx,(notes,users)=>resolve([fetch,notes,users]))
				}
			}
		})
	}
	/**
	 * @returns [updated fetch, null] on normal update; [null,null] if fetch is stale; [updated fetch, all stored fetch data] if write conflict
	 */
	addDataToFetch(
		timestamp: number, fetch: Readonly<FetchEntry>,
		newNotes: Readonly<Note[]>, newUsers: Readonly<Users>
	): Promise<[fetch: FetchEntry|null, writeConflictData: [notes: Note[], users: Users]|null]> {
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['fetches','notes','users'],'readwrite')
			tx.onerror=()=>reject(new Error(`Database save error: ${tx.error}`))
			const fetchStore=tx.objectStore('fetches')
			const noteStore=tx.objectStore('notes')
			const userStore=tx.objectStore('users')
			const fetchRequest=fetchStore.get(fetch.timestamp)
			fetchRequest.onsuccess=()=>{
				if (fetchRequest.result==null) return resolve([null,null])
				const storedFetch: FetchEntry = fetchRequest.result
				if (storedFetch.writeTimestamp>fetch.writeTimestamp) {
					storedFetch.accessTimestamp=timestamp
					fetchStore.put(storedFetch)
					return readNotesAndUsersInTx(storedFetch.timestamp,tx,(notes,users)=>resolve([storedFetch,[notes,users]]))
				}
				storedFetch.writeTimestamp=storedFetch.accessTimestamp=timestamp
				fetchStore.put(storedFetch)
				tx.oncomplete=()=>resolve([storedFetch,null])
				const range=makeTimestampRange(fetch.timestamp)
				const noteCursorRequest=noteStore.index('sequence').openCursor(range,'prev')
				noteCursorRequest.onsuccess=()=>{
					let sequenceNumber=0
					const cursor=noteCursorRequest.result
					if (cursor) sequenceNumber=cursor.value.sequenceNumber
					writeNotes(noteStore,fetch.timestamp,newNotes,sequenceNumber)
					writeUsers(userStore,fetch.timestamp,newUsers)
				}
			}
		})
	}
	updateDataInFetch(
		timestamp: number, fetch: Readonly<FetchEntry>,
		updatedNote: Readonly<Note>, newUsers: Readonly<Users>
	): Promise<null> { // doesn't return new fetch because this is able to run parallel to main cycle that adds data
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['fetches','notes','users'],'readwrite')
			tx.onerror=()=>reject(new Error(`Database save error: ${tx.error}`))
			const fetchStore=tx.objectStore('fetches')
			const noteStore=tx.objectStore('notes')
			const userStore=tx.objectStore('users')
			const fetchRequest=fetchStore.get(fetch.timestamp)
			fetchRequest.onsuccess=()=>{
				if (fetchRequest.result==null) return resolve(null)
				const storedFetch: FetchEntry = fetchRequest.result
				storedFetch.accessTimestamp=timestamp
				fetchStore.put(storedFetch)
				tx.oncomplete=()=>resolve(null)
				const noteCursorRequest=noteStore.openCursor([fetch.timestamp,updatedNote.id])
				noteCursorRequest.onsuccess=()=>{
					const cursor=noteCursorRequest.result
					if (!cursor) return
					const storedNoteEntry: NoteEntry = cursor.value
					const updatedNoteEntry: NoteEntry = {
						fetchTimestamp: storedNoteEntry.fetchTimestamp,
						note: updatedNote,
						sequenceNumber: storedNoteEntry.sequenceNumber
					}
					cursor.update(updatedNoteEntry)
					writeUsers(userStore,fetch.timestamp,newUsers)
				}
			}
		})
	}
	/*
	beforeFetch(fetchId, endDate) {
		// read fetch record
		// compare endDate
		// if same return 'ok to fetch'
		// fetch...
		// update access
		// return [new endDate, new notes, new users]
	}
	*/
	static open(): Promise<NoteViewerDB> {
		return new Promise((resolve,reject)=>{
			const request=indexedDB.open('OsmNoteViewer')
			request.onsuccess=()=>{
				resolve(new NoteViewerDB(request.result))
			}
			request.onupgradeneeded=()=>{
				const idb=request.result
				const fetchStore=idb.createObjectStore('fetches',{keyPath:'timestamp'})
				fetchStore.createIndex('query','queryString',{unique: true})
				fetchStore.createIndex('access','accessTimestamp')
				const noteStore=idb.createObjectStore('notes',{keyPath:['fetchTimestamp','note.id']})
				noteStore.createIndex('sequence',['fetchTimestamp','sequenceNumber'])
				const userStore=idb.createObjectStore('users',{keyPath:['fetchTimestamp','user.id']})
			}
			request.onerror=()=>{
				reject(new Error(`failed to open the database`))
			}
			request.onblocked=()=>{
				reject(new Error(`failed to open the database because of blocked version change`)) // shouldn't happen
			}
		})
	}
}

function cleanupOutdatedFetches(timestamp: number, tx: IDBTransaction) {
	const maxFetchAge=24*60*60*1000
	const range1=IDBKeyRange.upperBound(timestamp-maxFetchAge)
	const range2=IDBKeyRange.upperBound([timestamp-maxFetchAge,+Infinity])
	tx.objectStore('notes').delete(range2)
	tx.objectStore('users').delete(range2)
	tx.objectStore('fetches').delete(range1)
}

function makeTimestampRange(timestamp: number): IDBKeyRange {
	return IDBKeyRange.bound([timestamp,-Infinity],[timestamp,+Infinity])
}

function readNotesAndUsersInTx(timestamp: number, tx: IDBTransaction, callback: (notes: Note[], users: Users)=>void) {
	const range=makeTimestampRange(timestamp)
	const noteRequest=tx.objectStore('notes').index('sequence').getAll(range)
	noteRequest.onsuccess=()=>{
		const notes: Note[] = noteRequest.result.map(noteEntry=>noteEntry.note)
		const userRequest=tx.objectStore('users').getAll(range)
		userRequest.onsuccess=()=>{
			const users: Users = {}
			for (const userEntry of userRequest.result) {
				users[userEntry.user.id]=userEntry.user.name
			}
			callback(notes,users)
		}
	}
}

function writeNotes(noteStore: IDBObjectStore, fetchTimestamp: number,  notes: Iterable<Note>, sequenceNumber: number) {
	for (const note of notes) {
		sequenceNumber++
		const noteEntry: NoteEntry = {
			fetchTimestamp,
			note,
			sequenceNumber
		}
		noteStore.put(noteEntry)
	}
}

function writeUsers(userStore: IDBObjectStore, fetchTimestamp: number, users: Users) {
	for (const userId in users) {
		const name=users[userId]
		if (name==null) continue
		const userEntry: UserEntry = {
			fetchTimestamp,
			user: {
				id: Number(userId),
				name
			}
		}
		userStore.put(userEntry)
	}
}
