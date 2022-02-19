import {Note, Users, isNoteFeatureCollection, transformFeatureCollectionToNotesAndUsers} from './data'
import {NoteQuery, getNextFetchDetails} from './query'
import {NoteMap} from './map'
import writeNotesTableHeaderAndGetNoteAdder from './table'
import {makeUserLink} from './util'

export async function startFetcher(
	saveToQueryStorage: (query: NoteQuery, notes: Note[], users: Users) => void,
	$notesContainer: HTMLElement, $moreContainer: HTMLElement, $commandContainer: HTMLElement,
	map: NoteMap,
	$fetchButton: HTMLButtonElement,
	query: NoteQuery, notes: Note[], users: Users
) {
	const seenNotes: {[id: number]: boolean} = {}
	saveToQueryStorage(query,notes,users)
	map.clearNotes()
	$notesContainer.innerHTML=``
	$commandContainer.innerHTML=``
	let lastNote: Note | undefined
	let prevLastNote: Note | undefined
	let lastLimit: number | undefined
	let addNotesToTable: ((notes: Note[], users: Users) => void) | undefined
	if (notes.length>0) {
		addNotesToTable=writeNotesTableHeaderAndGetNoteAdder($notesContainer,$commandContainer,map)
		addNotesToTable(notes,users)
		map.fitNotes()
		rewriteLoadMoreButton()
	} else {
		lastNote=notes[notes.length-1]
		await fetchCycle()
	}
	async function fetchCycle() {
		rewriteMessage($moreContainer,`Loading notes of user `,[query.user],` ...`)
		const fetchDetails=getNextFetchDetails(query,lastNote,prevLastNote,lastLimit)
		if (fetchDetails.limit>10000) {
			rewriteMessage($moreContainer,`Fetching cannot continue because the required note limit exceeds max value allowed by API (this is very unlikely, if you see this message it's probably a bug)`)
			return
		}
		const url=`https://api.openstreetmap.org/api/0.6/notes/search.json?`+fetchDetails.parameters
		$fetchButton.disabled=true
		try {
			const response=await fetch(url)
			if (!response.ok) {
				const responseText=await response.text()
				rewriteFetchErrorMessage($moreContainer,query.user,`received the following error response`,responseText)
			} else {
				const data=await response.json()
				query.endedAt=Date.now()
				if (!isNoteFeatureCollection(data)) {
					rewriteMessage($moreContainer,`Received invalid data`)
					return
				}
				const unseenNotes=mergeNotesAndUsers(...transformFeatureCollectionToNotesAndUsers(data))
				saveToQueryStorage(query,notes,users)
				if (!addNotesToTable && notes.length<=0) {
					rewriteMessage($moreContainer,`User `,[query.user],` has no ${query.status=='open'?'open ':''}notes`)
					return
				}
				if (!addNotesToTable) {
					addNotesToTable=writeNotesTableHeaderAndGetNoteAdder($notesContainer,$commandContainer,map)
					addNotesToTable(unseenNotes,users)
					map.fitNotes()
				} else {
					addNotesToTable(unseenNotes,users)
				}
				if (data.features.length<fetchDetails.limit) {
					rewriteMessage($moreContainer,`Got all notes`)
					return
				}
				prevLastNote=lastNote
				lastNote=notes[notes.length-1]
				lastLimit=fetchDetails.limit
				rewriteLoadMoreButton()
			}
		} catch (ex) {
			if (ex instanceof TypeError) {
				rewriteFetchErrorMessage($moreContainer,query.user,`failed with the following error before receiving a response`,ex.message)
			} else {
				rewriteFetchErrorMessage($moreContainer,query.user,`failed for unknown reason`,`${ex}`)
			}
		} finally {
			$fetchButton.disabled=false
		}
	}
	function rewriteLoadMoreButton() {
		const $div=document.createElement('div')
		$moreContainer.innerHTML=''
		const $moreButton=document.createElement('button')
		$moreButton.textContent=`Load more notes`
		$moreButton.addEventListener('click',fetchCycle)
		$div.append($moreButton)
		$moreContainer.append($div)
	}
	function mergeNotesAndUsers(newNotes: Note[], newUsers: Users): Note[] {
		const unseenNotes: Note[] = []
		for (const note of newNotes) {
			if (seenNotes[note.id]) continue
			seenNotes[note.id]=true
			notes.push(note)
			unseenNotes.push(note)
		}
		Object.assign(users,newUsers)
		return unseenNotes
	}
}

function rewriteMessage($container: HTMLElement, ...items: Array<string|[string]>): HTMLElement {
	$container.innerHTML=''
	const $message=document.createElement('div')
	for (const item of items) {
		if (Array.isArray(item)) {
			const [username]=item
			$message.append(makeUserLink(username))
		} else {
			$message.append(item)
		}
	}
	$container.append($message)
	return $message
}

function rewriteErrorMessage($container: HTMLElement, ...items: Array<string|[string]>): HTMLElement {
	const $message=rewriteMessage($container,...items)
	$message.classList.add('error')
	return $message
}

function rewriteFetchErrorMessage($container: HTMLElement, username: string, responseKindText: string, fetchErrorText: string): void {
	const $message=rewriteErrorMessage($container,`Loading notes of user `,[username],` ${responseKindText}:`)
	const $error=document.createElement('pre')
	$error.textContent=fetchErrorText
	$message.append($error)
}
