import NoteViewerDB, {FetchEntry} from './db'
import {Note, Users, isNoteFeatureCollection, isNoteFeature, transformFeatureCollectionToNotesAndUsers, transformFeatureToNotesAndUsers} from './data'
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
	lastTriedPath: string | undefined
	recordInitialData( // TODO make it ctor
		initialNotes: Note[], initialUsers: Users
	) {
		this.recordData(initialNotes,initialUsers)
	}
	recordCycleData(
		newNotes: Note[], newUsers: Users, usedLimit: number, lastTriedPath: string|undefined
	): [
		unseenNotes: Note[], unseenUsers: Users
	] {
		this.lastLimit=usedLimit
		if (lastTriedPath!=null) this.lastTriedPath=lastTriedPath
		return this.recordData(newNotes,newUsers)
	}
	getNextCycleArguments(limit: number): [
		limit: number, lastNote: Note|undefined, prevLastNote: Note|undefined, lastLimit: number|undefined, lastTriedPath: string|undefined
	] {
		return [limit,this.lastNote,this.prevLastNote,this.lastLimit,this.lastTriedPath]
	}
	private recordData(
		newNotes: Note[], newUsers: Users
	): [
		unseenNotes: Note[], unseenUsers: Users
	] {
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

export abstract class NoteFetcher {
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
	private updateRequestHintInAdvancedMode: ()=>void = ()=>{}
	private resetUpdateRequestHintInAdvancedMode() {
		this.updateRequestHintInAdvancedMode=()=>{}
	}
	reactToLimitUpdateForAdvancedMode() {
		this.updateRequestHintInAdvancedMode()
	}
	async start(
		db: NoteViewerDB,
		noteTable: NoteTable, $moreContainer: HTMLElement,
		getLimit: ()=>number, getAutoLoad: ()=>boolean,
		blockDownloads: (disabled: boolean) => void,
		moreButtonIntersectionObservers: IntersectionObserver[],
		query: NoteQuery,
		clearStore: boolean
	) {
		this.resetUpdateRequestHintInAdvancedMode()
		const getCycleFetchDetails=this.getGetCycleFetchDetails(query)
		if (!getCycleFetchDetails) return // shouldn't happen
		const continueCycle=this.getContinueCycle(query,$moreContainer)
		if (!continueCycle) return // shouldn't happen - and it should be in ctor probably
		const fetchState=new FetchState()
		const queryString=makeNoteQueryString(query) // empty string == don't know how to encode the query, thus won't save it to db
		const fetchEntry: FetchEntry|null = await(async()=>{ // null fetch entry == don't save to db
			if (!queryString) return null
			if (clearStore) {
				return await db.getFetchWithClearedData(Date.now(),queryString)
			} else {
				const [fetchEntry,initialNotes,initialUsers]=await db.getFetchWithRestoredData(Date.now(),queryString) // TODO actually have a reasonable limit here - or have a link above the table with 'clear' arg: "If the stored data is too large, click this link to restart the query from scratch"
				fetchState.recordInitialData(initialNotes,initialUsers)
				return fetchEntry
			}
		})()
		let nFullyFilteredFetches=0
		let holdOffAutoLoad=false
		const rewriteLoadMoreButton=(): HTMLButtonElement => {
			const $requestOutput=document.createElement('output')
			this.updateRequestHintInAdvancedMode=()=>{
				const limit=getLimit()
				const fetchDetails=getCycleFetchDetails(...fetchState.getNextCycleArguments(limit))
				if (fetchDetails.pathAndParametersList.length==0) {
					$requestOutput.replaceChildren(`no request`)
					return
				}
				const url=this.constructUrl(...fetchDetails.pathAndParametersList[0])
				const $a=makeLink(url,url)
				$a.classList.add('request')
				$requestOutput.replaceChildren(makeElement('code')()($a))
			}
			this.updateRequestHintInAdvancedMode()
			$moreContainer.innerHTML=''
			const $button=document.createElement('button')
			$button.textContent=`Load more notes`
			$button.addEventListener('click',fetchCycle)
			$moreContainer.append(
				makeDiv()($button),
				makeDiv('advanced-hint')(`Resulting request: `,$requestOutput)
			)
			// TODO warn about not saving stuff to db
			// empty query string == don't know how to save
			// empty fetch entry == fetch got stale
			return $button
		}
		const fetchCycle=async()=>{
			// TODO check if db data is more fresh than our state
			rewriteLoadingButton()
			const limit=getLimit()
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
				let lastTriedPath: string|undefined
				for (const pathAndParameters of fetchDetails.pathAndParametersList) {
					const [path,parameters]=pathAndParameters
					lastTriedPath=path
					const url=this.constructUrl(path,parameters)
					const response=await fetch(url)
					if (!response.ok) {
						if (response.status==410) { // likely hidden note in ids query
							continue // TODO report it
						}
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
				const [unseenNotes,unseenUsers]=fetchState.recordCycleData(downloadedNotes,downloadedUsers,fetchDetails.limit,lastTriedPath)
				if (fetchEntry) await db.addDataToFetch(Date.now(),fetchEntry,fetchState.notes.values(),unseenNotes,fetchState.users,unseenUsers)
				// TODO check if fetch wasn't cleared off as a result of write
				// - if it was cleared: disable db saving; warn user that the data is not saved
				if (!noteTable && fetchState.notes.size<=0) {
					rewriteMessage($moreContainer,`No matching notes found`)
					return
				}
				addNewNotesToTable(unseenNotes)
				if (!continueCycle(fetchState.notes,fetchDetails,downloadedNotes,fetchState.lastTriedPath)) return
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
						if (!getAutoLoad()) return
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
	async updateNote($a: HTMLAnchorElement, noteId: number, noteTable: NoteTable) {
		// TODO update db
		$a.classList.add('loading')
		try {
			const url=e`https://api.openstreetmap.org/api/0.6/notes/${noteId}.json`
			const response=await fetch(url)
			if (!response.ok) throw new TypeError(`note reload failed`)
			const data=await response.json()
			if (!isNoteFeature(data)) throw new TypeError(`note reload received invalid data`)
			const [newNotes,newUsers]=transformFeatureToNotesAndUsers(data)
			if (newNotes.length!=1) throw new TypeError(`note reload received unexpected number of notes`)
			const [newNote]=newNotes
			if (newNote.id!=noteId) throw new TypeError(`note reload received unexpected note`)
			$a.classList.remove('absent')
			$a.title=''
			noteTable.replaceNote(newNote,newUsers)
		} catch (ex) {
			$a.classList.add('absent')
			if (ex instanceof TypeError) {
				$a.title=ex.message
			} else {
				$a.title=`unknown error ${ex}`
			}
		} finally {
			$a.classList.remove('loading')
		}
	}
	protected abstract getRequestUrlBase(): string
	protected abstract getRequestUrlPathAndParameters(query: NoteQuery, limit: number): [path:string,parameters:string]|undefined
	protected abstract getGetCycleFetchDetails(query: NoteQuery): (
		(limit: number, lastNote: Note|undefined, prevLastNote: Note|undefined, lastLimit: number|undefined, lastTriedPath: string|undefined) => NoteFetchDetails
	) | undefined
	protected abstract accumulateDownloadedData(downloadedNotes: Note[], downloadedUsers: Users, data: any): boolean
	protected abstract getContinueCycle(query: NoteQuery, $moreContainer: HTMLElement): (
		(notes: Map<number,Note>, fetchDetails: NoteFetchDetails, downloadedNotes: Note[], lastTriedPath: string|undefined) => boolean
	) | undefined
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
		(limit: number, lastNote: Note|undefined, prevLastNote: Note|undefined, lastLimit: number|undefined, lastTriedPath: string|undefined) => NoteFetchDetails
	) | undefined {
		if (query.mode!='search') return
		return (limit,lastNote,prevLastNote,lastLimit,lastTriedPath)=>getNextFetchDetails(query,limit,lastNote,prevLastNote,lastLimit)
	}
	protected getContinueCycle(query: NoteQuery, $moreContainer: HTMLElement): (
		(notes: Map<number,Note>, fetchDetails: NoteFetchDetails, downloadedNotes: Note[], lastTriedPath: string|undefined) => boolean
	) | undefined {
		return (notes,fetchDetails,downloadedNotes,lastTriedPath)=>{
			if (downloadedNotes.length<fetchDetails.limit) {
				rewriteMessage($moreContainer,`Got all ${notes.size} notes`)
				return false
			}
			return true
		}
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
		(limit: number, lastNote: Note|undefined, prevLastNote: Note|undefined, lastLimit: number|undefined, lastTriedPath: string|undefined) => NoteFetchDetails
	) | undefined {
		if (query.mode!='bbox') return
		const parametersWithoutLimit=this.getRequestUrlParametersWithoutLimit(query)
		return (limit,lastNote,prevLastNote,lastLimit,lastTriedPath)=>({
			pathAndParametersList: [['',parametersWithoutLimit+e`&limit=${limit}`]],
			limit
		})
	}
	protected getContinueCycle(query: NoteQuery, $moreContainer: HTMLElement): (
		(notes: Map<number,Note>, fetchDetails: NoteFetchDetails, downloadedNotes: Note[], lastTriedPath: string|undefined) => boolean
	) | undefined {
		return (notes,fetchDetails,downloadedNotes,lastTriedPath)=>{
			if (notes.size<fetchDetails.limit) {
				rewriteMessage($moreContainer,`Got all ${notes.size} notes in the area`)
			} else {
				rewriteMessage($moreContainer,`Got all ${notes.size} requested notes`)
			}
			return false
		}
	}
}

export class NoteIdsFetcher extends NoteFetcher {
	protected getRequestUrlBase(): string {
		return `https://api.openstreetmap.org/api/0.6/notes/`
	}
	protected getRequestUrlPathAndParameters(query: NoteQuery, limit: number): [path:string,parameters:string]|undefined {
		if (query.mode!='ids') return
		if (query.ids.length==0) return
		return [String(query.ids[0]),''] // TODO actually going to do several requests, can list them here somehow?
	}
	protected getGetCycleFetchDetails(query: NoteQuery): (
		(limit: number, lastNote: Note|undefined, prevLastNote: Note|undefined, lastLimit: number|undefined, lastTriedPath: string|undefined) => NoteFetchDetails
	) | undefined {
		if (query.mode!='ids') return
		const uniqueIds=new Set<number>()
		for (const id of query.ids) uniqueIds.add(id)
		return (limit,lastNote,prevLastNote,lastLimit,lastTriedPath)=>{
			const lastTriedId=Number(lastTriedPath)
			let skip=true
			const pathAndParametersList: [path: string, parameters: string][] = []
			for (const id of uniqueIds) {
				if (pathAndParametersList.length>=limit) break
				if (skip) {
					if (lastTriedPath) {
						if (id==lastTriedId) {
							skip=false
						}
						continue
					} else if (lastNote) { // was restored from db w/o yet making any fetch
						if (id==lastNote.id) {
							skip=false
						}
						continue
					} else {
						skip=false
					}
				}
				pathAndParametersList.push([String(id),''])
			}
			return {
				pathAndParametersList,
				limit
			}
		}
	}
	protected accumulateDownloadedData(downloadedNotes: Note[], downloadedUsers: Users, data: any): boolean {
		if (!isNoteFeature(data)) return false
		const [newNotes,newUsers]=transformFeatureToNotesAndUsers(data)
		downloadedNotes.push(...newNotes)
		Object.assign(downloadedUsers,newUsers)
		return true
	}
	protected getContinueCycle(query: NoteQuery, $moreContainer: HTMLElement): (
		(notes: Map<number,Note>, fetchDetails: NoteFetchDetails, downloadedNotes: Note[], lastTriedPath: string|undefined) => boolean
	) | undefined {
		if (query.mode!='ids') return
		let lastId: number
		const uniqueIds=new Set<number>()
		for (const id of query.ids) {
			if (uniqueIds.has(id)) continue
			lastId=id
			uniqueIds.add(id)
		}
		return (notes,fetchDetails,downloadedNotes,lastTriedPath)=>{
			if (lastTriedPath!=null && Number(lastTriedPath)==lastId) {
				rewriteMessage($moreContainer,`Got all ${notes.size} notes`)
				return false
			}
			return true
		}
	}
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
