import {Note, Users} from './data'

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
	view(): Promise<FetchEntry[]> {
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['fetches'],'readonly')
			const request=tx.objectStore('fetches').index('access').getAll()
			request.onsuccess=()=>resolve(request.result)
			tx.onerror=()=>reject(new Error(`Database view error: ${tx.error}`))
		})
	}
	delete(fetch: FetchEntry): Promise<void> {
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['fetches','notes','users'],'readwrite')
			const range=makeTimestampRange(fetch.timestamp)
			tx.objectStore('notes').delete(range)
			tx.objectStore('users').delete(range)
			tx.objectStore('fetches').delete(fetch.timestamp)
			tx.oncomplete=()=>resolve()
			tx.onerror=()=>reject(new Error(`Database delete error: ${tx.error}`))
		})
	}
	clear(queryString: string): Promise<FetchEntry> {
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		const timestamp=Date.now() // TODO receive all .now() from outside, probably as first arg
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['fetches','notes','users'],'readwrite')
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
			tx.onerror=()=>reject(new Error(`Database clear error: ${tx.error}`))
		})
	}
	load(queryString: string): Promise<[fetch: FetchEntry, notes: Note[], users: Users]> {
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		const timestamp=Date.now()
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['fetches','notes','users'],'readwrite')
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
					const range=makeTimestampRange(fetch.timestamp)
					const noteRequest=tx.objectStore('notes').index('sequence').getAll(range)
					noteRequest.onsuccess=()=>{
						const notes: Note[] = noteRequest.result.map(noteEntry=>noteEntry.note)
						const userRequest=tx.objectStore('users').getAll(range)
						userRequest.onsuccess=()=>{
							const users: Users = {}
							for (const userEntry of userRequest.result) {
								users[userEntry.user.id]=userEntry.user.name
							}
							resolve([fetch,notes,users])
						}
					}
				}
			}
			tx.onerror=()=>reject(new Error(`Database read error: ${tx.error}`))
		})
	}
	save(fetch: FetchEntry, allNotes: Note[], newNotes: Note[], allUsers: Users, newUsers: Users): Promise<void> {
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		const timestamp=Date.now()
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['fetches','notes','users'],'readwrite')
			const fetchStore=tx.objectStore('fetches')
			const noteStore=tx.objectStore('notes')
			const userStore=tx.objectStore('users')
			const fetchRequest=fetchStore.get(fetch.timestamp)
			fetchRequest.onsuccess=()=>{
				fetch.writeTimestamp=fetch.accessTimestamp=timestamp
				if (fetchRequest.result==null) {
					fetchStore.put(fetch)
					writeNotesAndUsers(0,allNotes,allUsers)
				} else {
					const storedFetch: FetchEntry = fetchRequest.result
					// if (storedFetch.writeTimestamp>fetch.writeTimestamp) {
						// TODO write conflict if doesn't match
						//	report that newNotes shouldn't be merged
						//	then should receive oldNotes instead of newNotes and merge them here
					// }
					fetchStore.put(fetch)
					const range=makeTimestampRange(fetch.timestamp)
					const noteCursorRequest=noteStore.index('sequence').openCursor(range,'prev')
					noteCursorRequest.onsuccess=()=>{
						let sequenceNumber=0
						const cursor=noteCursorRequest.result
						if (cursor) sequenceNumber=cursor.value.sequenceNumber
						writeNotesAndUsers(sequenceNumber,newNotes,newUsers)
					}
				}
			}
			tx.oncomplete=()=>resolve()
			tx.onerror=()=>reject(new Error(`Database save error: ${tx.error}`))
			function writeNotesAndUsers(sequenceNumber: number, notes: Note[], users: Users) {
				for (const note of notes) {
					sequenceNumber++
					const noteEntry: NoteEntry = {
						fetchTimestamp: fetch.timestamp,
						note,
						sequenceNumber
					}
					noteStore.put(noteEntry)
				}
				for (const userId in users) {
					const name=users[userId]
					if (name==null) continue
					const userEntry: UserEntry = {
						fetchTimestamp: fetch.timestamp,
						user: {
							id: Number(userId),
							name
						}
					}
					userStore.put(userEntry)
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