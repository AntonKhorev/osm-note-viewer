import NoteViewerDB, {FetchEntry} from './db'
import {Note, Users, isNoteFeatureCollection, isNoteFeature, transformFeatureCollectionToNotesAndUsers, NoteFeatureCollection} from './data'
import {NoteQuery, NoteFetchDetails, getNextFetchDetails, makeNoteQueryString, NoteBboxQuery} from './query'
import NoteTable from './table'
import {makeElement, makeDiv, makeLink, makeEscapeTag} from './util'

const e=makeEscapeTag(encodeURIComponent)

const maxSingleAutoLoadLimit=200
const maxTotalAutoLoadLimit=1000
const maxFullyFilteredFetches=10

class FetchState {
	// fetch state
	readonly notes = new Map<number,Note>()
	readonly users: Users = {}
	lastNote: Note | undefined
	prevLastNote: Note | undefined
	lastLimit: number | undefined
	recordInitialData( // TODO make it ctor
		initialNotes: Note[], initialUsers: Users
	) {
		this.recordData(initialNotes,initialUsers)
	}
	recordCycleData(
		newNotes: Note[], newUsers: Users, usedLimit: number
	): [
		unseenNotes: Note[], unseenUsers: Users
	] {
		return this.recordData(newNotes,newUsers,usedLimit)
	}
	getNextCycleArguments(limit: number): [
		limit: number, lastNote: Note|undefined, prevLastNote: Note|undefined, lastLimit: number|undefined
	] {
		return [limit,this.lastNote,this.prevLastNote,this.lastLimit]
	}
	private recordData(
		newNotes: Note[], newUsers: Users, usedLimit?: number
	): [
		unseenNotes: Note[], unseenUsers: Users
	] {
		this.lastLimit=usedLimit
		this.prevLastNote=this.lastNote
		const unseenNotes: Note[] = []
		const unseenUsers: Users ={}
		for (const note of newNotes) {
			if (this.notes.has(note.id)) continue
			this.notes.set(note.id,note)
			this.lastNote=note
			unseenNotes.push(note)
		}
		for (const newUserIdString in newUsers) {
			const newUserId=Number(newUserIdString) // TODO rewrite this hack
			if (this.users[newUserId]!=newUsers[newUserId]) unseenUsers[newUserId]=newUsers[newUserId]
		}
		Object.assign(this.users,newUsers)
		return [unseenNotes,unseenUsers]
	}
}

abstract class NoteFetcher {
	getRequestUrls(query: NoteQuery, limit: number): [type: string, url: string][] {
		const pathAndParameters=this.getRequestUrlPathAndParameters(query,limit)
		if (pathAndParameters==null) return []
		return ['json','xml','gpx','rss'].map(type=>[type,this.constructUrl(...pathAndParameters,type)])
	}
	protected constructUrl(path: string, parameters: string, type: string = 'json'): string {
		const extension=type=='xml'?'':'.'+type
		let url=this.getRequestUrlBase()
		if (path) url+=path
		url+=extension
		if (parameters) url+='?'+parameters
		return url
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
		$limitSelect: HTMLSelectElement, $autoLoadCheckbox: {checked:boolean},
		blockDownloads: (disabled: boolean) => void,
		moreButtonIntersectionObservers: IntersectionObserver[],
		query: NoteQuery,
		clearStore: boolean
	) {
		this.resetLimitUpdater()
		const getCycleFetchDetails=this.getGetCycleFetchDetails(query)
		if (!getCycleFetchDetails) return // shouldn't happen
		const fetchState=new FetchState()
		const queryString=makeNoteQueryString(query)
		const fetchEntry: FetchEntry|null = await(async()=>{
			if (!queryString) return null
			if (clearStore) {
				return await db.clear(queryString)
			} else {
				const [fetchEntry,initialNotes,initialUsers]=await db.load(queryString) // TODO actually have a reasonable limit here - or have a link above the table with 'clear' arg: "If the stored data is too large, click this link to restart the query from scratch"
				fetchState.recordInitialData(initialNotes,initialUsers)
				return fetchEntry
			}
		})()
		let nFullyFilteredFetches=0
		let holdOffAutoLoad=false
		const rewriteLoadMoreButton=(): HTMLButtonElement => {
			this.limitUpdater=()=>{
				const limit=getLimit($limitSelect)
				const fetchDetails=getCycleFetchDetails(...fetchState.getNextCycleArguments(limit))
				const url=this.constructUrl(...fetchDetails.pathAndParametersList[0])
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
			const fetchDetails=getCycleFetchDetails(...fetchState.getNextCycleArguments(limit))
			if (fetchDetails==null) return
			if (fetchDetails.limit>10000) {
				rewriteMessage($moreContainer,`Fetching cannot continue because the required note limit exceeds max value allowed by API (this is very unlikely, if you see this message it's probably a bug)`)
				return
			}
			blockDownloads(true)
			try {
				const downloadedNotes: Note[] = []
				const downloadedUsers: Users = {}
				for (const pathAndParameters of fetchDetails.pathAndParametersList) {
					const url=this.constructUrl(...pathAndParameters)
					const response=await fetch(url)
					if (!response.ok) {
						const responseText=await response.text()
						rewriteFetchErrorMessage($moreContainer,query,`received the following error response`,responseText)
						return
					}
					const data=await response.json()
					if (!this.accumulateDownloadedData(downloadedNotes,downloadedUsers,data)) {
						rewriteMessage($moreContainer,`Received invalid data`)
						return
					}
				}
				const [unseenNotes,unseenUsers]=fetchState.recordCycleData(downloadedNotes,downloadedUsers,fetchDetails.limit)
				if (fetchEntry) await db.save(fetchEntry,fetchState.notes.values(),unseenNotes,fetchState.users,unseenUsers)
				if (!noteTable && fetchState.notes.size<=0) {
					rewriteMessage($moreContainer,`No matching notes found`)
					return
				}
				addNewNotesToTable(unseenNotes)
				if (!this.continueCycle(fetchState.notes,fetchDetails,downloadedNotes,$moreContainer)) return
				const nextFetchDetails=getCycleFetchDetails(...fetchState.getNextCycleArguments(limit))
				const $moreButton=rewriteLoadMoreButton()
				if (holdOffAutoLoad) {
					holdOffAutoLoad=false
				} else if (fetchState.notes.size>maxTotalAutoLoadLimit) {
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
				blockDownloads(false)
			}
		}
		if (!clearStore) {
			addNewNotesToTable(fetchState.notes.values())
			if (fetchState.notes.size>0) {
				rewriteLoadMoreButton()
			} else {
				holdOffAutoLoad=true // db was empty; expected to show something => need to fetch; not expected to autoload
				await fetchCycle()
			}
		} else {
			await fetchCycle()
		}
		function addNewNotesToTable(newNotes: Iterable<Note>) {
			const nUnfilteredNotes=noteTable.addNotes(newNotes,fetchState.users)
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
	protected abstract getRequestUrlPathAndParameters(query: NoteQuery, limit: number): [path:string,parameters:string]|undefined
	protected abstract getGetCycleFetchDetails(query: NoteQuery): (
		(limit: number, lastNote: Note|undefined, prevLastNote: Note|undefined, lastLimit: number|undefined) => NoteFetchDetails
	) | undefined
	protected abstract accumulateDownloadedData(downloadedNotes: Note[], downloadedUsers: Users, data: any): boolean
	protected abstract continueCycle(
		notes: Map<number,Note>,
		fetchDetails: NoteFetchDetails, downloadedNotes: Note[],
		$moreContainer: HTMLElement
	): boolean
}

abstract class NoteFeatureCollectionFetcher extends NoteFetcher {
	protected accumulateDownloadedData(downloadedNotes: Note[], downloadedUsers: Users, data: any): boolean {
		if (!isNoteFeatureCollection(data)) return false
		const [newNotes,newUsers]=transformFeatureCollectionToNotesAndUsers(data)
		downloadedNotes.push(...newNotes)
		Object.assign(downloadedUsers,newUsers)
		return true
	}
}

export class NoteSearchFetcher extends NoteFeatureCollectionFetcher {
	protected getRequestUrlBase(): string {
		return `https://api.openstreetmap.org/api/0.6/notes/search`
	}
	protected getRequestUrlPathAndParameters(query: NoteQuery, limit: number): [path:string,parameters:string]|undefined {
		if (query.mode!='search') return
		return getNextFetchDetails(query,limit).pathAndParametersList[0]
	}
	protected getGetCycleFetchDetails(query: NoteQuery): (
		(limit: number, lastNote: Note|undefined, prevLastNote: Note|undefined, lastLimit: number|undefined) => NoteFetchDetails
	) | undefined {
		if (query.mode!='search') return
		return (limit,lastNote,prevLastNote,lastLimit)=>getNextFetchDetails(query,limit,lastNote,prevLastNote,lastLimit)
	}
	protected continueCycle(
		notes: Map<number,Note>,
		fetchDetails: NoteFetchDetails, downloadedNotes: Note[],
		$moreContainer: HTMLElement
	): boolean {
		if (downloadedNotes.length<fetchDetails.limit) {
			rewriteMessage($moreContainer,`Got all ${notes.size} notes`)
			return false
		}
		return true
	}
}

export class NoteBboxFetcher extends NoteFeatureCollectionFetcher {
	protected getRequestUrlBase(): string {
		return `https://api.openstreetmap.org/api/0.6/notes`
	}
	protected getRequestUrlPathAndParameters(query: NoteQuery, limit: number): [path:string,parameters:string]|undefined {
		if (query.mode!='bbox') return
		return ['',this.getRequestUrlParametersWithoutLimit(query)+e`&limit=${limit}`]
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
			pathAndParametersList: [['',parametersWithoutLimit+e`&limit=${limit}`]],
			limit
		})
	}
	protected continueCycle(
		notes: Map<number,Note>,
		fetchDetails: NoteFetchDetails, downloadedNotes: Note[],
		$moreContainer: HTMLElement
	): boolean {
		if (notes.size<fetchDetails.limit) {
			rewriteMessage($moreContainer,`Got all ${notes.size} notes in the area`)
		} else {
			rewriteMessage($moreContainer,`Got all ${notes.size} requested notes`)
		}
		return false
	}
}

/*
export class NoteIdsFetcher extends NoteFetcher {
	protected getRequestUrlBase(): string {
		return `https://api.openstreetmap.org/api/0.6/notes/`
	}
	protected getRequestUrlPathAndParameters(query: NoteQuery, limit: number): [path:string,parameters:string]|undefined {
		if (query.mode!='ids') return
		if (query.ids.length==0) return
		return ['',String(query.ids[0])] // TODO actually going to do several requests, can list them here somehow?
	}
	protected getGetCycleFetchDetails(query: NoteQuery): (
		(limit: number, lastNote: Note|undefined, prevLastNote: Note|undefined, lastLimit: number|undefined) => NoteFetchDetails
	) | undefined {
		if (query.mode!='ids') return
		const uniqueIds=new Set<number>()
		for (const id of query.ids) uniqueIds.add(id)
		return (limit,lastNote,prevLastNote,lastLimit)=>{
			let skip=true
			const parametersList: string[] = []
			for (const id of uniqueIds) {
				if (parametersList.length>=limit) break
				if (skip) {
					if (lastNote) {
						if (id==lastNote.id) {
							skip=false
						}
						continue
					} else {
						skip=false
					}
				}
				// parametersList.push() // TODO
			}
			return {
				parametersList,
				limit
			}
		}
	}
}
*/

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
