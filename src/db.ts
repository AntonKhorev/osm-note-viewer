import {Note} from './data'
import {NoteQuery} from './query'

export default class NoteViewerDB {
	private closed: boolean = false
	constructor(private idb: IDBDatabase) {
		console.log('created db') ///
		idb.onversionchange=()=>{
			idb.close()
			this.closed=true
		}
	}
	save(notes: Note[]): void {
		if (closed) {
			throw new Error(`Database is outdated, please reload the page.`)
		}
		const tx=this.idb.transaction('notes','readwrite')
		const noteStore=tx.objectStore('notes')
		for (const note of notes) {
			noteStore.put(note)
		}
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
			request.onsuccess=(ev:any)=>{
				if (!(ev.target.result instanceof IDBDatabase)) {
					reject(new Error(`opened database but resulted in unknown object`))
				}
				resolve(new NoteViewerDB(ev.target.result))
			}
			request.onupgradeneeded=(ev:any)=>{
				const idb=ev.target.result
				if (!(idb instanceof IDBDatabase)) {
					reject(new Error(`opened database but resulted in unknown object`))
				}
				// idb.createObjectStore("fetches",{autoIncrement:true})
				idb.createObjectStore('notes',{keyPath:'id'}) // TODO key is fetchId,id
				// idb.createObjectStore("users",{keyPath:'id'}) // key is fetchId,id
				// TODO resolve?
			}
			request.onerror=ev=>{
				reject(new Error(`failed to open the database`))
			}
			request.onblocked=ev=>{
				reject(new Error(`failed to open the database because of blocked version change`)) // shouldn't happen
			}
			// May trigger upgradeneeded, blocked or versionchange events.
		})
	}
}
