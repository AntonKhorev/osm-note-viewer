import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import {Note, Users, isNoteFeatureCollection, transformFeatureCollectionToNotesAndUsers} from './data'
import {ValidUserQueryPart, NoteQuery, getNextFetchDetails} from './query'
import NoteFilterPanel from './filter-panel'
import {NoteMap} from './map'
import CommandPanel from './command-panel'
import NoteTable from './table'
import {makeUserLink} from './util'

const maxSingleAutoLoadLimit=200
const maxTotalAutoLoadLimit=1000
const maxFullyFilteredFetches=10

export async function startFetcher(
	storage: NoteViewerStorage, db: NoteViewerDB,
	$notesContainer: HTMLElement, $moreContainer: HTMLElement, $commandContainer: HTMLElement,
	filterPanel: NoteFilterPanel, map: NoteMap,
	$limitSelect: HTMLSelectElement, $autoLoadCheckbox: HTMLInputElement, $fetchButton: HTMLButtonElement,
	query: NoteQuery,
	clearStore: boolean
) {
	filterPanel.unsubscribe()
	let noteTable: NoteTable | undefined
	const [notes,users,mergeNotesAndUsers]=makeNotesAndUsersAndMerger()
	if (clearStore) {
		await db.clear()
		storage.setItem('users',JSON.stringify(users))
	} else {
		let initialNotes: Note[] = []
		let initialUsers: Users = {}
		try {
			const usersString=storage.getItem('users')
			if (usersString!=null) initialUsers=JSON.parse(usersString)
			initialNotes=await db.load() // TODO actually have a reasonable limit here - or have a link above the table with 'clear' arg: "If the stored data is too large, click this link to restart the query from scratch"
		} catch {}
		mergeNotesAndUsers(initialNotes,initialUsers)
	}
	filterPanel.subscribe(noteFilter=>noteTable?.updateFilter(notes,users,noteFilter))
	map.clearNotes()
	$notesContainer.innerHTML=``
	$commandContainer.innerHTML=``
	const commandPanel=new CommandPanel($commandContainer,map,storage)
	let lastNote: Note | undefined
	let prevLastNote: Note | undefined
	let lastLimit: number | undefined
	let nFullyFilteredFetches=0
	if (!clearStore) {
		addNewNotes(notes)
		lastNote=notes[notes.length-1]
		rewriteLoadMoreButton()
	} else {
		await fetchCycle()
	}
	function addNewNotes(newNotes: Note[]) {
		if (!noteTable) {
			noteTable=new NoteTable($notesContainer,commandPanel,map,filterPanel.noteFilter)
		}
		const nUnfilteredNotes=noteTable.addNotes(newNotes,users)
		if (nUnfilteredNotes==0) {
			nFullyFilteredFetches++
		} else {
			nFullyFilteredFetches=0
		}
	}
	async function fetchCycle() {
		rewriteLoadingButton()
		const limit=getLimit($limitSelect)
		const fetchDetails=getNextFetchDetails(query,limit,lastNote,prevLastNote,lastLimit)
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
				rewriteFetchErrorMessage($moreContainer,query,`received the following error response`,responseText)
			} else {
				const data=await response.json()
				query.endedAt=Date.now()
				if (!isNoteFeatureCollection(data)) {
					rewriteMessage($moreContainer,`Received invalid data`)
					return
				}
				const unseenNotes=mergeNotesAndUsers(...transformFeatureCollectionToNotesAndUsers(data))
				await saveToQueryStorage(query,unseenNotes,users)
				if (!noteTable && notes.length<=0) {
					rewriteMessage($moreContainer,`User `,[query],` has no ${query.status=='open'?'open ':''}notes`)
					return
				}
				addNewNotes(unseenNotes)
				if (data.features.length<fetchDetails.limit) {
					rewriteMessage($moreContainer,`Got all ${notes.length} notes`)
					return
				}
				prevLastNote=lastNote
				lastNote=notes[notes.length-1]
				lastLimit=fetchDetails.limit
				const $moreButton=rewriteLoadMoreButton()
				if (notes.length>maxTotalAutoLoadLimit) {
					$moreButton.append(` (no auto download because displaying more than ${maxTotalAutoLoadLimit} notes)`)
				} else if (getNextFetchDetails(query,limit,lastNote,prevLastNote,lastLimit).limit>maxSingleAutoLoadLimit) {
					$moreButton.append(` (no auto download because required batch is larger than ${maxSingleAutoLoadLimit})`)
				} else if (nFullyFilteredFetches>maxFullyFilteredFetches) {
					$moreButton.append(` (no auto download because ${maxFullyFilteredFetches} consecutive fetches were fully filtered)`)
					nFullyFilteredFetches=0
				} else {
					const moreButtonIntersectionObserver=new IntersectionObserver((entries)=>{
						if (entries.length<=0) return
						if (!entries[0].isIntersecting) return
						if (!$autoLoadCheckbox.checked) return
						moreButtonIntersectionObserver.disconnect()
						$moreButton.click()
					})
					moreButtonIntersectionObserver.observe($moreButton)
				}
			}
		} catch (ex) {
			if (ex instanceof TypeError) {
				rewriteFetchErrorMessage($moreContainer,query,`failed with the following error before receiving a response`,ex.message)
			} else {
				rewriteFetchErrorMessage($moreContainer,query,`failed for unknown reason`,`${ex}`)
			}
		} finally {
			$fetchButton.disabled=false
		}
	}
	function rewriteLoadMoreButton(): HTMLButtonElement {
		$moreContainer.innerHTML=''
		const $div=document.createElement('div')
		const $button=document.createElement('button')
		$button.textContent=`Load more notes`
		$button.addEventListener('click',fetchCycle)
		$div.append($button)
		$moreContainer.append($div)
		return $button
	}
	function rewriteLoadingButton(): void {
		$moreContainer.innerHTML=''
		const $div=document.createElement('div')
		const $button=document.createElement('button')
		$button.textContent=`Loading notes...`
		$button.disabled=true
		$div.append($button)
		$moreContainer.append($div)
	}
	async function saveToQueryStorage(query: NoteQuery, newNotes: Note[], users: Users): Promise<void> {
		await db.save(newNotes)
		storage.setItem('query',JSON.stringify(query))
		storage.setItem('users',JSON.stringify(users))
	}
}

function makeNotesAndUsersAndMerger(): [
	notes: Note[], users: Users,
	merger: (newNotes: Note[], newUsers: Users) => Note[]
] {
	const seenNotes: {[id: number]: boolean} = {}
	const notes: Note[] = []
	const users: Users = {}
	const merger=(newNotes: Note[], newUsers: Users): Note[] => {
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
	return [notes,users,merger]
}

function rewriteMessage($container: HTMLElement, ...items: Array<string|[ValidUserQueryPart]>): HTMLElement {
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

function rewriteErrorMessage($container: HTMLElement, ...items: Array<string|[ValidUserQueryPart]>): HTMLElement {
	const $message=rewriteMessage($container,...items)
	$message.classList.add('error')
	return $message
}

function rewriteFetchErrorMessage($container: HTMLElement, user: ValidUserQueryPart, responseKindText: string, fetchErrorText: string): void {
	const $message=rewriteErrorMessage($container,`Loading notes of user `,[user],` ${responseKindText}:`)
	const $error=document.createElement('pre')
	$error.textContent=fetchErrorText
	$message.append($error)
}

function getLimit($limitSelect: HTMLSelectElement): number {
	const limit=Number($limitSelect.value)
	if (Number.isInteger(limit) && limit>=1 && limit<=10000) return limit
	return 20
}
