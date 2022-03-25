import {Note, Users} from './data'

interface NoteEntry {
	// TODO fetchId
	note: Note
	sequenceNumber: number
}

interface UserEntry {
	// TODO fetchId
	user: {
		id: number
		name: string
	}
}

export default class NoteViewerDB {
	private closed: boolean = false
	constructor(private idb: IDBDatabase) {
		idb.onversionchange=()=>{
			idb.close()
			this.closed=true
		}
	}
	clear(): Promise<void> {
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['notes','users'],'readwrite')
			tx.objectStore('notes').clear()
			tx.objectStore('users').clear()
			tx.oncomplete=()=>resolve()
			tx.onerror=()=>reject(new Error(`Database clear error: ${tx.error}`))
		})
	}
	save(notes: Note[], users: Users): Promise<void> {
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['notes','users'],'readwrite')
			const noteStore=tx.objectStore('notes')
			const userStore=tx.objectStore('users')
			const noteSequenceIndex=noteStore.index('sequence')
			const noteCursorRequest=noteSequenceIndex.openCursor(null,'prev')
			noteCursorRequest.onsuccess=()=>{
				let sequenceNumber=0
				const cursor=noteCursorRequest.result
				if (cursor) sequenceNumber=cursor.value.sequenceNumber
				for (const note of notes) {
					sequenceNumber++
					noteStore.put({note,sequenceNumber})
				}
				for (const userId in users) {
					userStore.put({user:{
						id: Number(userId),
						name: users[userId]
					}})
				}
			}
			tx.oncomplete=()=>resolve()
			tx.onerror=()=>reject(new Error(`Database save error: ${tx.error}`))
		})
	}
	load(): Promise<[Note[], Users]> {
		if (this.closed) throw new Error(`Database is outdated, please reload the page.`)
		return new Promise((resolve,reject)=>{
			const tx=this.idb.transaction(['notes','users'],'readonly')
			const noteStore=tx.objectStore('notes')
			const userStore=tx.objectStore('users')
			const noteSequenceIndex=noteStore.index('sequence')
			const noteRequest=noteSequenceIndex.getAll()
			noteRequest.onsuccess=()=>{
				const notes=noteRequest.result.map(noteEntry=>noteEntry.note)
				const userRequest=userStore.getAll()
				userRequest.onsuccess=()=>{
					const users: Users = {}
					for (const userEntry of userRequest.result) {
						users[userEntry.user.id]=userEntry.user.name
					}
					resolve([notes,users])
				}
			}
			tx.onerror=()=>reject(new Error(`Database read error: ${tx.error}`))
		})
	}
	/*
	getFetchRecord(query: NoteQuery) { // TODO NoteQuery shouldn't include timestamps
		if (closed) {
			throw new Error(`Database is outdated, please reload the page.`)
		}
		const tx=this.idb.transaction('fetches','readonly')
		tx.onerror=()=>{
			throw new Error(`Database error`)
		}
		const fetches=tx.objectStore('fetches')
		// TODO look if there's a fetch matching query
		// let request = books.add(book); // (3)
		// 	request.onsuccess = function() { // (4)
		// console.log("Book added to the store", request.result);
		// }
		// request.onerror = function() {
		// 	console.log("Error", request.error);
		// }

		// TODO if none found
		const request=fetches.add(query) // TODO add a record with all fields
		request.onsuccess=()=>{
			// request.result // this is a key
		}
		// request.onerror=()=>reject(`DB read error: ${request.error}`)
	}
	beforeFetch(fetchId, endDate) {
		// read fetch record
		// compare endDate
		// if same return 'ok to fetch'
		// fetch...
		// update access
		// return [new endDate, new notes, new users]
	}
	async save(query: NoteQuery, notes: Note[], users: Users): Promise<void> {
		if (closed) {
			throw new Error(`Database is outdated, please reload the page.`)
		}
		// TODO check request end date
		const tx=this.idb.transaction(['fetches','notes','users'],'readwrite')
		tx.onerror=()=>{
			throw new Error(`Database error`)
		}
		const notes=tx.objectStore('notes')
		// TODO can't use async?
		const saveNote=(note: Note): Promise<void> => new Promise((resolve,reject)=>{
			const request=notes.put(note) // or notes.put(note,[fetchId,note.id])
			request.onsuccess=()=>resolve()
			request.onerror=()=>reject(`Database write error: ${request.error}`)
		})
		// for (
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
				if (!(idb instanceof IDBDatabase)) {
					reject(new Error(`opened database but resulted in unknown object`))
				}
				// idb.createObjectStore("fetches",{autoIncrement:true})
				const noteStore=idb.createObjectStore('notes',{keyPath:'note.id'}) // TODO key is fetchId,id
				noteStore.createIndex('sequence','sequenceNumber')
				idb.createObjectStore('users',{keyPath:'user.id'}) // TODO key is fetchId,id
			}
			request.onerror=()=>{
				reject(new Error(`failed to open the database`))
			}
			request.onblocked=()=>{
				reject(new Error(`failed to open the database because of blocked version change`)) // shouldn't happen
			}
			// May trigger upgradeneeded, blocked or versionchange events.
		})
	}
}
