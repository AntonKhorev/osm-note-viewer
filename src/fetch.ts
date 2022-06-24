import NoteViewerDB, {FetchEntry} from './db'
import {Note, Users, isNoteFeatureCollection, transformFeatureCollectionToNotesAndUsers, NoteFeatureCollection} from './data'
import {NoteQuery, NoteFetchDetails, getNextFetchDetails, makeNoteQueryString, NoteBboxQuery} from './query'
import NoteTable from './table'
import {makeElement, makeDiv, makeLink, makeEscapeTag} from './util'

const e=makeEscapeTag(encodeURIComponent)

const maxSingleAutoLoadLimit=200
const maxTotalAutoLoadLimit=1000
const maxFullyFilteredFetches=10

abstract class NoteFetcher {
	getRequestUrls(query: NoteQuery, limit: number): [type: string, url: string][] {
		const parameters=this.getRequestUrlParameters(query,limit)
		if (parameters==null) return []
		const base=this.getRequestUrlBase()
		return [
			['json',`${base}.json?${parameters}`],
			['xml',`${base}?${parameters}`],
			['gpx',`${base}.gpx?${parameters}`],
			['rss',`${base}.rss?${parameters}`],
		]
	}
	private $requestOutput=document.createElement('output')
	private limitUpdater: ()=>void = ()=>{}
	private resetLimitUpdater() {
		this.limitUpdater=()=>{}
	}
	limitWasUpdated() {
		this.limitUpdater()
	}
	async start(
		db: NoteViewerDB,
		noteTable: NoteTable, $moreContainer: HTMLElement,
		$limitSelect: HTMLSelectElement, $autoLoadCheckbox: {checked:boolean}, $fetchButton: HTMLButtonElement,
		moreButtonIntersectionObservers: IntersectionObserver[],
		query: NoteQuery,
		clearStore: boolean
	) {
		this.resetLimitUpdater()
		const getCycleFetchDetails=this.getGetCycleFetchDetails(query)
		if (!getCycleFetchDetails) return // shouldn't happen
		const [notes,users,mergeNotesAndUsers]=makeNotesAndUsersAndMerger()
		const queryString=makeNoteQueryString(query)
		const fetchEntry: FetchEntry = await(async()=>{
			if (clearStore) {
				return await db.clear(queryString)
			} else {
				const [fetchEntry,initialNotes,initialUsers]=await db.load(queryString) // TODO actually have a reasonable limit here - or have a link above the table with 'clear' arg: "If the stored data is too large, click this link to restart the query from scratch"
				mergeNotesAndUsers(initialNotes,initialUsers)
				return fetchEntry
			}
		})()
		let lastNote: Note | undefined
		let prevLastNote: Note | undefined
		let lastLimit: number | undefined
		let nFullyFilteredFetches=0
		let holdOffAutoLoad=false
		const rewriteLoadMoreButton=(): HTMLButtonElement => {
			this.limitUpdater=()=>{
				const limit=getLimit($limitSelect)
				const fetchDetails=getCycleFetchDetails(limit,lastNote,prevLastNote,lastLimit)
				const url=this.getRequestUrlBase()+`.json?`+fetchDetails.parameters
				this.$requestOutput.replaceChildren(makeElement('code')()(
					makeLink(url,url)
				))
			}
			this.limitUpdater()
			$moreContainer.innerHTML=''
			const $button=document.createElement('button')
			$button.textContent=`Load more notes`
			$button.addEventListener('click',fetchCycle)
			$moreContainer.append(
				makeDiv()($button),
				makeDiv('request')(`Resulting request: `,this.$requestOutput)
			)
			return $button
		}
		const fetchCycle=async()=>{
			rewriteLoadingButton()
			const limit=getLimit($limitSelect)
			const fetchDetails=getCycleFetchDetails(limit,lastNote,prevLastNote,lastLimit)
			if (fetchDetails==null) return
			if (fetchDetails.limit>10000) {
				rewriteMessage($moreContainer,`Fetching cannot continue because the required note limit exceeds max value allowed by API (this is very unlikely, if you see this message it's probably a bug)`)
				return
			}
			const url=this.getRequestUrlBase()+`.json?`+fetchDetails.parameters
			$fetchButton.disabled=true
			try {
				const response=await fetch(url)
				if (!response.ok) {
					const responseText=await response.text()
					rewriteFetchErrorMessage($moreContainer,query,`received the following error response`,responseText)
					return
				}
				const data=await response.json()
				if (!isNoteFeatureCollection(data)) {
					rewriteMessage($moreContainer,`Received invalid data`)
					return
				}
				const [unseenNotes,unseenUsers]=mergeNotesAndUsers(...transformFeatureCollectionToNotesAndUsers(data))
				await db.save(fetchEntry,notes,unseenNotes,users,unseenUsers)
				if (!noteTable && notes.length<=0) {
					rewriteMessage($moreContainer,`No matching notes found`)
					return
				}
				addNewNotes(unseenNotes)
				prevLastNote=lastNote
				lastNote=notes[notes.length-1]
				lastLimit=fetchDetails.limit
				if (!this.continueCycle(notes,fetchDetails,data,$moreContainer)) return
				const nextFetchDetails=getCycleFetchDetails(limit,lastNote,prevLastNote,lastLimit)
				const $moreButton=rewriteLoadMoreButton()
				if (holdOffAutoLoad) {
					holdOffAutoLoad=false
				} else if (notes.length>maxTotalAutoLoadLimit) {
					$moreButton.append(` (no auto download because displaying more than ${maxTotalAutoLoadLimit} notes)`)
				} else if (nextFetchDetails.limit>maxSingleAutoLoadLimit) {
					$moreButton.append(` (no auto download because required batch is larger than ${maxSingleAutoLoadLimit})`)
				} else if (nFullyFilteredFetches>maxFullyFilteredFetches) {
					$moreButton.append(` (no auto download because ${maxFullyFilteredFetches} consecutive fetches were fully filtered)`)
					nFullyFilteredFetches=0
				} else {
					const moreButtonIntersectionObserver=new IntersectionObserver((entries)=>{
						if (entries.length<=0) return
						if (!entries[0].isIntersecting) return
						if (!$autoLoadCheckbox.checked) return
						while (moreButtonIntersectionObservers.length>0) moreButtonIntersectionObservers.pop()?.disconnect()
						$moreButton.click()
					})
					moreButtonIntersectionObservers.push(moreButtonIntersectionObserver)
					moreButtonIntersectionObserver.observe($moreButton)
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
		if (!clearStore) {
			addNewNotes(notes)
			if (notes.length>0) {
				lastNote=notes[notes.length-1]
				rewriteLoadMoreButton()
			} else {
				holdOffAutoLoad=true // db was empty; expected to show something => need to fetch; not expected to autoload
				await fetchCycle()
			}
		} else {
			await fetchCycle()
		}
		function addNewNotes(newNotes: Note[]) {
			const nUnfilteredNotes=noteTable.addNotes(newNotes,users)
			if (nUnfilteredNotes==0) {
				nFullyFilteredFetches++
			} else {
				nFullyFilteredFetches=0
			}
		}
		function rewriteLoadingButton(): void {
			$moreContainer.innerHTML=''
			const $button=document.createElement('button')
			$button.textContent=`Loading notes...`
			$button.disabled=true
			$moreContainer.append(makeDiv()($button))
		}
	}
	protected abstract getRequestUrlBase(): string
	protected abstract getRequestUrlParameters(query: NoteQuery, limit: number): string|undefined
	protected abstract getGetCycleFetchDetails(query: NoteQuery): (
		(limit: number, lastNote: Note|undefined, prevLastNote: Note|undefined, lastLimit: number|undefined) => NoteFetchDetails
	) | undefined
	protected abstract continueCycle(
		notes: Note[],
		fetchDetails: NoteFetchDetails, data: NoteFeatureCollection,
		$moreContainer: HTMLElement
	): boolean
}

export class NoteSearchFetcher extends NoteFetcher {
	protected getRequestUrlBase(): string {
		return `https://api.openstreetmap.org/api/0.6/notes/search`
	}
	protected getRequestUrlParameters(query: NoteQuery, limit: number): string|undefined {
		if (query.mode!='search') return
		return getNextFetchDetails(query,limit).parameters
	}
	protected getGetCycleFetchDetails(query: NoteQuery): (
		(limit: number, lastNote: Note|undefined, prevLastNote: Note|undefined, lastLimit: number|undefined) => NoteFetchDetails
	) | undefined {
		if (query.mode!='search') return
		return (limit,lastNote,prevLastNote,lastLimit)=>getNextFetchDetails(query,limit,lastNote,prevLastNote,lastLimit)
	}
	protected continueCycle(
		notes: Note[],
		fetchDetails: NoteFetchDetails, data: NoteFeatureCollection,
		$moreContainer: HTMLElement
	): boolean {
		if (data.features.length<fetchDetails.limit) {
			rewriteMessage($moreContainer,`Got all ${notes.length} notes`)
			return false
		}
		return true
	}
}

export class NoteBboxFetcher extends NoteFetcher {
	protected getRequestUrlBase(): string {
		return `https://api.openstreetmap.org/api/0.6/notes`
	}
	protected getRequestUrlParameters(query: NoteQuery, limit: number): string|undefined {
		if (query.mode!='bbox') return
		return this.getRequestUrlParametersWithoutLimit(query)+e`&limit=${limit}`
	}
	private getRequestUrlParametersWithoutLimit(query: NoteBboxQuery): string {
		return e`bbox=${query.bbox}&closed=${query.closed}`
	}
	protected getGetCycleFetchDetails(query: NoteQuery): (
		(limit: number, lastNote: Note|undefined, prevLastNote: Note|undefined, lastLimit: number|undefined) => NoteFetchDetails
	) | undefined {
		if (query.mode!='bbox') return
		const parametersWithoutLimit=this.getRequestUrlParametersWithoutLimit(query)
		return (limit,lastNote,prevLastNote,lastLimit)=>({
			parameters:parametersWithoutLimit+e`&limit=${limit}`,
			limit
		})
	}
	protected continueCycle(
		notes: Note[],
		fetchDetails: NoteFetchDetails, data: NoteFeatureCollection,
		$moreContainer: HTMLElement
	): boolean {
		if (notes.length<fetchDetails.limit) {
			rewriteMessage($moreContainer,`Got all ${notes.length} notes in the area`)
		} else {
			rewriteMessage($moreContainer,`Got all ${notes.length} requested notes`)
		}
		return false
	}
}

function makeNotesAndUsersAndMerger(): [
	notes: Note[], users: Users,
	merger: (newNotes: Note[], newUsers: Users) => [Note[],Users]
] {
	const seenNotes: {[id: number]: boolean} = {}
	const notes: Note[] = []
	const users: Users = {}
	const merger=(newNotes: Note[], newUsers: Users): [Note[],Users] => {
		const unseenNotes: Note[] = []
		const unseenUsers: Users ={}
		for (const note of newNotes) {
			if (seenNotes[note.id]) continue
			seenNotes[note.id]=true
			notes.push(note)
			unseenNotes.push(note)
		}
		for (const newUserIdString in newUsers) {
			const newUserId=Number(newUserIdString) // TODO rewrite this hack
			if (users[newUserId]!=newUsers[newUserId]) unseenUsers[newUserId]=newUsers[newUserId]
		}
		Object.assign(users,newUsers)
		return [unseenNotes,unseenUsers]
	}
	return [notes,users,merger]
}

function rewriteMessage($container: HTMLElement, ...items: Array<string>): HTMLElement {
	$container.innerHTML=''
	const $message=document.createElement('div')
	for (const item of items) {
		// if (Array.isArray(item)) { // TODO implement displaying query details
		// 	const [username]=item
		// 	$message.append(makeUserLink(username))
		// } else {
			$message.append(item)
		// }
	}
	$container.append($message)
	return $message
}

function rewriteErrorMessage($container: HTMLElement, ...items: Array<string>): HTMLElement {
	const $message=rewriteMessage($container,...items)
	$message.classList.add('error')
	return $message
}

function rewriteFetchErrorMessage($container: HTMLElement, query: NoteQuery, responseKindText: string, fetchErrorText: string): void {
	// TODO display query details
	const $message=rewriteErrorMessage($container,`Loading notes ${responseKindText}:`)
	const $error=document.createElement('pre')
	$error.textContent=fetchErrorText
	$message.append($error)
}

function getLimit($limitSelect: HTMLSelectElement): number {
	const limit=Number($limitSelect.value)
	if (Number.isInteger(limit) && limit>=1 && limit<=10000) return limit
	return 20
}
