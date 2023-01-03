import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import Server from './server'
import ServerList from './server-list'
import GlobalEventsListener from './events'
import GlobalHistory from './history'
import {NoteMap} from './map'
import Navbar from './navbar'
import AboutDialog from './about-dialog'
import FigureDialog from './figure'
import NoteTable from './table'
import NoteFilterPanel from './filter-panel'
import {NoteQuery, NoteSearchQuery, makeNoteQueryFromHash, makeNoteQueryString} from './query'
import {NoteFetcherEnvironment, NoteFetcherRequest, NoteFetcherRun,
	NoteSearchFetcherRequest, NoteBboxFetcherRequest, NoteIdsFetcherRequest,
	NoteSearchFetcherRun, NoteBboxFetcherRun, NoteIdsFetcherRun} from './fetch'
import {NoteFetchDialogSharedCheckboxes,
	NoteFetchDialog, NoteSearchFetchDialog, NoteBboxFetchDialog, NoteXmlFetchDialog, NotePlaintextFetchDialog
} from './fetch-dialog'

class FetchDialogs { // TODO move to -dialog module
	searchDialog: NoteFetchDialog
	bboxDialog: NoteFetchDialog
	xmlDialog: NoteFetchDialog
	plaintextDialog: NoteFetchDialog
	constructor(
		server: Server,
		$container: HTMLElement, $moreContainer: HTMLElement,
		noteTable: NoteTable, map: NoteMap,
		hashQuery: NoteQuery|undefined,
		submitQueryToDialog: (dialog:NoteFetchDialog,query:NoteQuery)=>void,
		limitChangeListener: (dialog:NoteFetchDialog)=>void,
	) {
		const $sharedCheckboxes: NoteFetchDialogSharedCheckboxes = {
			showImages: [],
			advancedMode: []
		}
		const makeFetchDialog = (
			fetcherRequest: NoteFetcherRequest,
			fetchDialogCtor: (
				getRequestApiPaths: (query: NoteQuery, limit: number) => [type: string, apiPath: string][],
				submitQuery: (query: NoteQuery) => void
			) => NoteFetchDialog
		): NoteFetchDialog => {
			const dialog=fetchDialogCtor(
				(query,limit)=>fetcherRequest.getRequestApiPaths(query,limit),
				(query)=>submitQueryToDialog(dialog,query)
			)
			dialog.limitChangeListener=()=>limitChangeListener(dialog)
			dialog.write($container)
			dialog.populateInputs(hashQuery)
			return dialog
		}
		this.searchDialog=makeFetchDialog(
			new NoteSearchFetcherRequest,
			(getRequestApiPaths,submitQuery)=>new NoteSearchFetchDialog($sharedCheckboxes,server,getRequestApiPaths,submitQuery)
		)
		this.bboxDialog=makeFetchDialog(
			new NoteBboxFetcherRequest,
			(getRequestApiPaths,submitQuery)=>new NoteBboxFetchDialog($sharedCheckboxes,server,getRequestApiPaths,submitQuery,map)
		)
		this.xmlDialog=makeFetchDialog(
			new NoteIdsFetcherRequest,
			(getRequestApiPaths,submitQuery)=>new NoteXmlFetchDialog($sharedCheckboxes,server,getRequestApiPaths,submitQuery)
		)
		this.plaintextDialog=makeFetchDialog(
			new NoteIdsFetcherRequest,
			(getRequestApiPaths,submitQuery)=>new NotePlaintextFetchDialog($sharedCheckboxes,server,getRequestApiPaths,submitQuery,noteTable)
		)

		const handleSharedCheckboxes = ($checkboxes: HTMLInputElement[], stateChangeListener: (state:boolean)=>void) => {
			for (const $checkbox of $checkboxes) {
				$checkbox.addEventListener('input',inputListener)
			}
			function inputListener(this: HTMLInputElement) {
				const state=this.checked
				for (const $checkbox of $checkboxes) {
					$checkbox.checked=state
				}
				stateChangeListener(state)
			}
		}
		handleSharedCheckboxes($sharedCheckboxes.showImages,state=>noteTable.setShowImages(state))
		handleSharedCheckboxes($sharedCheckboxes.advancedMode,state=>{
			for (const dialog of this.allDialogs) {
				dialog.reactToAdvancedModeChange()
			}
			$container.classList.toggle('advanced-mode',state)
			$moreContainer.classList.toggle('advanced-mode',state)
		})
	}
	get allDialogs() {
		return [this.searchDialog,this.bboxDialog,this.xmlDialog,this.plaintextDialog]
	}
	populateInputs(query: NoteQuery | undefined): void {
		for (const dialog of this.allDialogs) {
			dialog.populateInputs(query)
		}
	}
	resetFetch(): void {
		for (const dialog of this.allDialogs) {
			dialog.resetFetch()
		}
	}
	getDialogFromQuery(query: NoteQuery): NoteFetchDialog|undefined {
		if (query.mode=='search') {
			return this.searchDialog
		} else if (query.mode=='bbox') {
			return this.bboxDialog
		} else if (query.mode=='ids') {
			return this.plaintextDialog
		}
	}
}

export default class NoteFetchPanel {
	// TODO have invoking dialog object; react only on dl params change in it; display that fieldset differently
	private fetcherRun?: NoteFetcherRun
	private fetcherInvoker?: NoteFetchDialog
	constructor(
		storage: NoteViewerStorage, db: NoteViewerDB, server: Server|undefined, serverList: ServerList,
		globalEventsListener: GlobalEventsListener, globalHistory: GlobalHistory,
		$container: HTMLElement, $moreContainer: HTMLElement,
		navbar: Navbar, filterPanel: NoteFilterPanel|undefined,
		noteTable: NoteTable|undefined, map: NoteMap|undefined, figureDialog: FigureDialog|undefined
	) {
		const self=this
		const moreButtonIntersectionObservers: IntersectionObserver[] = []
		const hashQuery=makeNoteQueryFromHash(globalHistory.getQueryHash())

		let fetchDialogs: FetchDialogs|undefined
		if (server && noteTable && map) {
			fetchDialogs=new FetchDialogs(
				server,$container,$moreContainer,noteTable,map,hashQuery,
				(dialog:NoteFetchDialog,query:NoteQuery)=>{
					modifyHistory(query,true)
					startFetcher(query,true,false,dialog)
				},
				(dialog:NoteFetchDialog)=>{
					if (this.fetcherRun && this.fetcherInvoker==dialog) {
						this.fetcherRun.reactToLimitUpdateForAdvancedMode()
					}
				}
			)
			for (const dialog of fetchDialogs.allDialogs) {
				navbar.addTab(dialog)
			}
		}
		const aboutDialog=new AboutDialog(storage,db,server,serverList)
		aboutDialog.write($container)
		navbar.addTab(aboutDialog,true)
		
		globalHistory.onQueryHashChange=(queryHash: string)=>{
			const query=makeNoteQueryFromHash(queryHash)
			openQueryDialog(query,false)
			modifyHistory(query,false) // in case location was edited manually
			if (fetchDialogs) {
				fetchDialogs.populateInputs(query)
			}
			startFetcherFromQuery(query,false,false)
			globalHistory.restoreScrollPosition()
		}
		openQueryDialog(hashQuery,true)
		modifyHistory(hashQuery,false)
		startFetcherFromQuery(
			hashQuery,false,
			globalHistory.hasMapHash() // when just opened a note-viewer page with map hash set - if query is set too, don't fit its result, keep the map hash
		)

		globalEventsListener.userListener=(_, uid: number, username?:string)=>{
			const query: NoteSearchQuery = {
				mode: 'search',
				closed: -1,
				sort: 'created_at',
				order: 'newest',
			}
			if (username!=null) {
				query.display_name=username
			} else {
				query.user=uid
			}
			openQueryDialog(query,false)
			if (fetchDialogs) {
				fetchDialogs.populateInputs(query)
				fetchDialogs.searchDialog.$section.scrollIntoView()
			}
		}
		
		function openQueryDialog(query: NoteQuery | undefined, initial: boolean): void {
			if (!fetchDialogs) return
			if (!query) {
				if (initial) navbar.openTab(fetchDialogs.searchDialog.shortTitle)
			} else {
				const dialog=fetchDialogs.getDialogFromQuery(query)
				if (!dialog) return
				navbar.openTab(dialog.shortTitle)
			}
		}
		function startFetcherFromQuery(query: NoteQuery|undefined, clearStore: boolean, suppressFitNotes: boolean): void {
			if (!fetchDialogs) return
			if (!query) return
			const dialog=fetchDialogs.getDialogFromQuery(query)
			if (!dialog) return
			startFetcher(query,clearStore,suppressFitNotes,dialog)
		}
		function startFetcher(
			query: NoteQuery, clearStore: boolean, suppressFitNotes: boolean, dialog: NoteFetchDialog
		): void {
			if (!(server && fetchDialogs && noteTable)) return
			if (query.mode!='search' && query.mode!='bbox' && query.mode!='ids') return
			fetchDialogs.resetFetch() // TODO run for all dialogs... for now only bboxDialog has meaningful action
			if (figureDialog) figureDialog.close()
			while (moreButtonIntersectionObservers.length>0) moreButtonIntersectionObservers.pop()?.disconnect()
			if (map) {
				map.clearNotes()
				if (suppressFitNotes) {
					map.needToFitNotes=false
				}
			}
			noteTable.reset()
			if (filterPanel) {
				filterPanel.unsubscribe() // TODO still needed? table used to be reconstructed but now it's permanent
				filterPanel.subscribe(noteFilter=>noteTable.updateFilter(noteFilter))
			}
			const environment: NoteFetcherEnvironment = {
				db,server,
				hostHash: serverList.getHostHash(server),
				noteTable,$moreContainer,
				getLimit: dialog.getLimit,
				getAutoLoad: dialog.getAutoLoad,
				blockDownloads: (disabled: boolean) => dialog.disableFetchControl(disabled),
				moreButtonIntersectionObservers,
			}
			self.fetcherInvoker=dialog
			if (query.mode=='search') {
				self.fetcherRun=new NoteSearchFetcherRun(environment,query,clearStore)
			} else if (query.mode=='bbox') {
				self.fetcherRun=new NoteBboxFetcherRun(environment,query,clearStore)
			} else if (query.mode=='ids') {
				self.fetcherRun=new NoteIdsFetcherRun(environment,query,clearStore)
			}
		}
		function modifyHistory(query: NoteQuery|undefined, push: boolean): void {
			const queryHash = query
				? makeNoteQueryString(query)
				: ''
			globalHistory.setQueryHash(queryHash,push)
		}
	}
	updateNote($a: HTMLAnchorElement, noteId: number): void {
		if (!this.fetcherRun) return
		this.fetcherRun.updateNote($a,noteId)
	}
}
