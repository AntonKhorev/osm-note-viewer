import type NoteViewerDB from './db'
import type {FetchEntry} from './db'
import type {ApiProvider} from './net'
import type {Note, Users} from './data'
import {isNoteFeatureCollection, isNoteFeature, transformFeatureCollectionToNotesAndUsers, transformFeatureToNotesAndUsers} from './data'
import type {NoteQuery, NoteSearchQuery, NoteBboxQuery, NoteIdsQuery, NoteFetchDetails} from './query'
import {makeNoteQueryStringWithHostHash, getNextFetchDetails} from './query'
import type {NoteTableUpdater} from './table'
import {makeElement, makeDiv, makeLink} from './util/html'
import {makeEscapeTag} from './util/escape'

const e=makeEscapeTag(encodeURIComponent)

const maxSingleAutoLoadLimit=200
const maxTotalAutoLoadLimit=1000
const maxFullyFilteredFetches=10

export abstract class NoteFetcherRequest {
	getRequestApiPaths(query: NoteQuery, limit: number): [type: string, url: string][] {
		const pathAndParameters=this.getRequestUrlPathAndParameters(query,limit)
		if (pathAndParameters==null) return []
		return ['json','xml','gpx','rss'].map(type=>[type,this.constructApiPath(...pathAndParameters,type)])
	}
	constructApiPath(path: string, parameters: string, type: string = 'json'): string {
		const extension=type=='xml'?'':'.'+type
		let url=this.getRequestApiBasePath()
		if (path) url+=path
		url+=extension
		if (parameters) url+='?'+parameters
		return url
	}
	protected abstract getRequestApiBasePath(): string
	protected abstract getRequestUrlPathAndParameters(query: NoteQuery, limit: number): [path:string,parameters:string]|undefined
}

export class NoteSearchFetcherRequest extends NoteFetcherRequest {
	protected getRequestApiBasePath(): string {
		return `notes/search`
	}
	protected getRequestUrlPathAndParameters(query: NoteQuery, limit: number): [path:string,parameters:string]|undefined {
		if (query.mode!='search') return
		return getNextFetchDetails(query,limit).pathAndParametersList[0]
	}
}

export class NoteBboxFetcherRequest extends NoteFetcherRequest {
	protected getRequestApiBasePath(): string {
		return `notes`
	}
	protected getRequestUrlPathAndParameters(query: NoteQuery, limit: number): [path:string,parameters:string]|undefined {
		if (query.mode!='bbox') return
		return ['',this.getRequestUrlParametersWithoutLimit(query)+e`&limit=${limit}`]
	}
	getRequestUrlParametersWithoutLimit(query: NoteBboxQuery): string {
		return e`bbox=${query.bbox}&closed=${query.closed}`
	}
}

export class NoteIdsFetcherRequest extends NoteFetcherRequest {
	protected getRequestApiBasePath(): string {
		return `notes/`
	}
	protected getRequestUrlPathAndParameters(query: NoteQuery, limit: number): [path:string,parameters:string]|undefined {
		if (query.mode!='ids') return
		if (query.ids.length==0) return
		return [String(query.ids[0]),''] // TODO actually going to do several requests, can list them here somehow?
	}
}

export interface NoteFetcherEnvironment {
	db: NoteViewerDB
	api: ApiProvider,
	token: string,
	hostHashValue: string|null,
	noteTable: NoteTableUpdater
	$moreContainer: HTMLElement
	getLimit: ()=>number
	getAutoLoad: ()=>boolean
	blockDownloads: (disabled: boolean) => void
	moreButtonIntersectionObservers: IntersectionObserver[]
}

export abstract class NoteFetcherRun {
	private db: NoteViewerDB
	private fetchEntry: Readonly<FetchEntry>|null = null
	readonly notes = new Map<number,Note>()
	readonly users: Users = {}
	lastNote: Note | undefined
	prevLastNote: Note | undefined
	lastLimit: number | undefined
	lastTriedPath: string | undefined // needed for ids fetch
	private updateRequestHintInAdvancedMode: ()=>void = ()=>{}
	constructor(
		{db,api,token,hostHashValue,noteTable,$moreContainer,getLimit,getAutoLoad,blockDownloads,moreButtonIntersectionObservers}: NoteFetcherEnvironment,
		query: NoteQuery,
		clearStore: boolean
	) {
		this.db=db
	;(async()=>{
		const queryString=makeNoteQueryStringWithHostHash(query,hostHashValue) // empty string == don't know how to encode the query, thus won't save it to db
		this.fetchEntry = await(async()=>{ // null fetch entry == don't save to db
			if (!queryString) return null
			if (clearStore) {
				return await db.getFetchWithClearedData(Date.now(),queryString)
			} else {
				const [fetchEntry,initialNotes,initialUsers]=await db.getFetchWithRestoredData(Date.now(),queryString) // TODO actually have a reasonable limit here - or have a link above the table with 'clear' arg: "If the stored data is too large, click this link to restart the query from scratch"
				this.recordData(initialNotes,initialUsers)
				return fetchEntry
			}
		})()
		let nFullyFilteredFetches=0
		let holdOffAutoLoad=false
		const addNewNotesToTable=(newNotes: Iterable<Note>): void => {
			const nUnfilteredNotes=noteTable.addNotes(newNotes,this.users)
			if (nUnfilteredNotes==0) {
				nFullyFilteredFetches++
			} else {
				nFullyFilteredFetches=0
			}
		}
		const rewriteLoadingButton=(): void => {
			$moreContainer.innerHTML=''
			const $button=document.createElement('button')
			$button.textContent=`Loading notes...`
			$button.disabled=true
			$moreContainer.append(makeDiv()($button))
		}
		const rewriteLoadMoreButton=(): HTMLButtonElement => {
			const $requestOutput=document.createElement('output')
			this.updateRequestHintInAdvancedMode=()=>{
				const limit=getLimit()
				const fetchDetails=this.getCycleFetchDetails(limit)
				if (fetchDetails.pathAndParametersList.length==0) {
					$requestOutput.replaceChildren(`no request`)
					return
				}
				const apiPath=this.request.constructApiPath(...fetchDetails.pathAndParametersList[0])
				const url=api.getUrl(apiPath)
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
			if (!this.fetchEntry) {
				$moreContainer.append(
					makeDiv()(
						`The fetch results are not saved locally because ${queryString
							? `the fetch is stale (likely the same query was made in another browser tab)`
							: `saving this query is not supported`
						}.`
					)
				)
			}
			return $button
		}
		const fetchCycle=async()=>{
			// TODO check if db data is more fresh than our state
			rewriteLoadingButton()
			const limit=getLimit()
			const fetchDetails=this.getCycleFetchDetails(limit)
			if (fetchDetails==null) return
			if (fetchDetails.limit>10000) {
				rewriteMessage($moreContainer,`Fetching cannot continue because the required note limit exceeds max value allowed by API (this is very unlikely, if you see this message it's probably a bug)`)
				return
			}
			blockDownloads(true)
			try {
				let downloadedNotes: Note[]|undefined = []
				let downloadedUsers: Users|undefined = {}
				let lastTriedPath: string|undefined
				for (const pathAndParameters of fetchDetails.pathAndParametersList) {
					const [path,parameters]=pathAndParameters
					lastTriedPath=path
					const apiPath=this.request.constructApiPath(path,parameters)
					const response=await api.fetch.withToken(token)(apiPath)
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
				let [unseenNotes,unseenUsers]=this.getUnseenData(downloadedNotes,downloadedUsers)
				if (this.fetchEntry) {
					const [newFetchEntry,writeConflictData]=await db.addDataToFetch(Date.now(),this.fetchEntry,unseenNotes,unseenUsers)
					this.fetchEntry=newFetchEntry
					if (!writeConflictData) {
						this.lastLimit=fetchDetails.limit
						if (lastTriedPath!=null) this.lastTriedPath=lastTriedPath
					} else {
						downloadedNotes=downloadedUsers=undefined // download was discarded
						;[unseenNotes,unseenUsers]=this.getUnseenData(...writeConflictData)
						this.lastLimit=undefined
						this.lastTriedPath=undefined
					}
				} else {
					this.lastLimit=fetchDetails.limit
					if (lastTriedPath!=null) this.lastTriedPath=lastTriedPath
				}
				this.recordData(unseenNotes,unseenUsers)
				if (this.notes.size<=0) {
					rewriteMessage($moreContainer,`No matching notes found`)
					return
				}
				addNewNotesToTable(unseenNotes)
				if (!this.continueCycle($moreContainer,fetchDetails,downloadedNotes)) return
				const nextFetchDetails=this.getCycleFetchDetails(limit)
				const $moreButton=rewriteLoadMoreButton()
				if (holdOffAutoLoad) {
					holdOffAutoLoad=false
				} else if (this.notes.size>maxTotalAutoLoadLimit) {
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
			addNewNotesToTable(this.notes.values())
			if (this.notes.size>0) {
				rewriteLoadMoreButton()
			} else {
				holdOffAutoLoad=true // db was empty; expected to show something => need to fetch; not expected to autoload
				await fetchCycle()
			}
		} else {
			await fetchCycle()
		}
	})()}
	reactToLimitUpdateForAdvancedMode() {
		this.updateRequestHintInAdvancedMode()
	}
	async updateNote(newNote: Note, newUsers: Users) {
		if (!this.fetchEntry) return
		await this.db.updateDataInFetch(Date.now(),this.fetchEntry,newNote,newUsers)
	}
	private recordData(newNotes: Readonly<Note[]>, newUsers: Readonly<Users>): void {
		this.prevLastNote=this.lastNote
		for (const note of newNotes) {
			if (this.notes.has(note.id)) continue
			this.notes.set(note.id,note)
			this.lastNote=note
		}
		Object.assign(this.users,newUsers)
	}
	private getUnseenData(
		newNotes: Readonly<Note[]>, newUsers: Readonly<Users>
	): [
		unseenNotes: Note[], unseenUsers: Users
	] {
		const unseenNotes: Note[] = []
		const unseenUsers: Users ={}
		for (const note of newNotes) {
			if (this.notes.has(note.id)) continue
			unseenNotes.push(note)
		}
		for (const newUserIdString in newUsers) {
			const newUserId=Number(newUserIdString) // TODO rewrite this hack
			if (this.users[newUserId]!=newUsers[newUserId]) unseenUsers[newUserId]=newUsers[newUserId]
		}
		return [unseenNotes,unseenUsers]
	}
	protected abstract get request(): NoteFetcherRequest
	protected abstract getCycleFetchDetails(limit: number): NoteFetchDetails
	protected abstract accumulateDownloadedData(downloadedNotes: Note[], downloadedUsers: Users, data: any): boolean
	protected abstract continueCycle($moreContainer: HTMLElement, fetchDetails: NoteFetchDetails, downloadedNotes: Note[]|undefined): boolean
}

abstract class NoteFeatureCollectionFetcherRun extends NoteFetcherRun {
	protected accumulateDownloadedData(downloadedNotes: Note[], downloadedUsers: Users, data: any) {
		if (!isNoteFeatureCollection(data)) return false
		const [newNotes,newUsers]=transformFeatureCollectionToNotesAndUsers(data)
		downloadedNotes.push(...newNotes)
		Object.assign(downloadedUsers,newUsers)
		return true
	}
}

export class NoteSearchFetcherRun extends NoteFeatureCollectionFetcherRun {
	constructor(environment: NoteFetcherEnvironment, protected query: NoteSearchQuery, clearStore: boolean) {
		super(environment,query,clearStore)
	}
	protected get request() {
		return new NoteSearchFetcherRequest
	}
	protected getCycleFetchDetails(limit: number) {
		return getNextFetchDetails(this.query,limit,this.lastNote,this.prevLastNote,this.lastLimit)
	}
	protected continueCycle($moreContainer: HTMLElement, fetchDetails: NoteFetchDetails, downloadedNotes: Note[]|undefined) {
		if (!downloadedNotes) return true
		if (downloadedNotes.length<fetchDetails.limit) {
			rewriteMessage($moreContainer,`Got all ${this.notes.size} notes`)
			return false
		}
		return true
	}
}

export class NoteBboxFetcherRun extends NoteFeatureCollectionFetcherRun {
	constructor(environment: NoteFetcherEnvironment, protected query: NoteBboxQuery, clearStore: boolean) {
		super(environment,query,clearStore)
	}
	protected get request() {
		return new NoteBboxFetcherRequest
	}
	protected getCycleFetchDetails(limit: number) {
		const parametersWithoutLimit=this.request.getRequestUrlParametersWithoutLimit(this.query)
		const pathAndParameters:[path:string,parameters:string]=['',parametersWithoutLimit+e`&limit=${limit}`]
		return {
			pathAndParametersList: [pathAndParameters],
			limit
		}
	}
	protected continueCycle($moreContainer: HTMLElement, fetchDetails: NoteFetchDetails, downloadedNotes: Note[]|undefined) {
		if (this.notes.size<fetchDetails.limit) {
			rewriteMessage($moreContainer,`Got all ${this.notes.size} notes in the area`)
		} else {
			rewriteMessage($moreContainer,`Got all ${this.notes.size} requested notes`)
		}
		return false
	}
}

export class NoteIdsFetcherRun extends NoteFetcherRun {
	private uniqueIds=new Set<number>()
	private lastId: number|undefined
	constructor(environment: NoteFetcherEnvironment, protected query: NoteIdsQuery, clearStore: boolean) {
		super(environment,query,clearStore)
		for (const id of query.ids) {
			if (this.uniqueIds.has(id)) continue
			this.uniqueIds.add(id)
			this.lastId=id
		}
	}
	protected get request() {
		return new NoteIdsFetcherRequest
	}
	protected getCycleFetchDetails(limit: number) {
		const lastTriedId=Number(this.lastTriedPath)
		let skip=true
		const pathAndParametersList: [path: string, parameters: string][] = []
		for (const id of this.uniqueIds) {
			if (pathAndParametersList.length>=limit) break
			if (skip) {
				if (this.lastTriedPath) {
					if (id==lastTriedId) {
						skip=false
					}
					continue
				} else if (this.lastNote) { // was restored from db w/o yet making any fetch
					if (id==this.lastNote.id) {
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
	protected accumulateDownloadedData(downloadedNotes: Note[], downloadedUsers: Users, data: any) {
		if (!isNoteFeature(data)) return false
		const [newNotes,newUsers]=transformFeatureToNotesAndUsers(data)
		downloadedNotes.push(...newNotes)
		Object.assign(downloadedUsers,newUsers)
		return true
	}
	protected continueCycle($moreContainer: HTMLElement, fetchDetails: NoteFetchDetails, downloadedNotes: Note[]|undefined) {
		if (this.lastId==null) return false
		if (this.lastTriedPath!=null && Number(this.lastTriedPath)==this.lastId) {
			rewriteMessage($moreContainer,`Got all ${this.notes.size} notes`)
			return false
		}
		return true
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
