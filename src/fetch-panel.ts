import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import Server from './server'
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

export default class NoteFetchPanel {
	// TODO have invoking dialog object; react only on dl params change in it; display that fieldset differently
	private fetcherRun?: NoteFetcherRun
	private fetcherInvoker?: NoteFetchDialog
	constructor(
		storage: NoteViewerStorage, db: NoteViewerDB, server: Server,
		globalEventsListener: GlobalEventsListener, globalHistory: GlobalHistory,
		$container: HTMLElement, $moreContainer: HTMLElement,
		navbar: Navbar, filterPanel: NoteFilterPanel,
		noteTable: NoteTable, map: NoteMap, figureDialog: FigureDialog
	) {
		const self=this
		const moreButtonIntersectionObservers: IntersectionObserver[] = []
		const $sharedCheckboxes: NoteFetchDialogSharedCheckboxes = {
			showImages: [],
			advancedMode: []
		}
		const hashQuery=makeNoteQueryFromHash(globalHistory.getQueryHash())

		// make fetchers and dialogs
		const makeFetchDialog = (
			fetcherRequest: NoteFetcherRequest,
			fetchDialogCtor: (
				getRequestApiPaths: (query: NoteQuery, limit: number) => [type: string, apiPath: string][],
				submitQuery: (query: NoteQuery) => void
			) => NoteFetchDialog
		): NoteFetchDialog => {
			const dialog=fetchDialogCtor((query,limit)=>fetcherRequest.getRequestApiPaths(query,limit),(query)=>{
				modifyHistory(query,true)
				startFetcher(query,true,false,dialog)
			})
			dialog.limitChangeListener=()=>{
				if (this.fetcherRun && this.fetcherInvoker==dialog) {
					this.fetcherRun.reactToLimitUpdateForAdvancedMode()
				}
			}
			dialog.write($container)
			dialog.populateInputs(hashQuery)
			navbar.addTab(dialog)
			return dialog
		}
		const searchDialog=makeFetchDialog(
			new NoteSearchFetcherRequest,
			(getRequestApiPaths,submitQuery)=>new NoteSearchFetchDialog($sharedCheckboxes,server,getRequestApiPaths,submitQuery)
		)
		const bboxDialog=makeFetchDialog(
			new NoteBboxFetcherRequest,
			(getRequestApiPaths,submitQuery)=>new NoteBboxFetchDialog($sharedCheckboxes,server,getRequestApiPaths,submitQuery,map)
		)
		const xmlDialog=makeFetchDialog(
			new NoteIdsFetcherRequest,
			(getRequestApiPaths,submitQuery)=>new NoteXmlFetchDialog($sharedCheckboxes,server,getRequestApiPaths,submitQuery)
		)
		const plaintextDialog=makeFetchDialog(
			new NoteIdsFetcherRequest,
			(getRequestApiPaths,submitQuery)=>new NotePlaintextFetchDialog($sharedCheckboxes,server,getRequestApiPaths,submitQuery,noteTable)
		)
		const aboutDialog=new AboutDialog(storage,db,server)
		aboutDialog.write($container)
		navbar.addTab(aboutDialog,true)
		
		handleSharedCheckboxes($sharedCheckboxes.showImages,state=>noteTable.setShowImages(state))
		handleSharedCheckboxes($sharedCheckboxes.advancedMode,state=>{
			for (const dialog of [searchDialog,bboxDialog,xmlDialog,plaintextDialog]) {
				dialog.reactToAdvancedModeChange()
			}
			$container.classList.toggle('advanced-mode',state)
			$moreContainer.classList.toggle('advanced-mode',state)
		})
		globalHistory.onQueryHashChange=(queryHash: string)=>{
			const query=makeNoteQueryFromHash(queryHash)
			openQueryDialog(query,false)
			modifyHistory(query,false) // in case location was edited manually
			populateInputs(query)
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
			populateInputs(query)
			searchDialog.$section.scrollIntoView()
		}
		
		function openQueryDialog(query: NoteQuery | undefined, initial: boolean): void {
			if (!query) {
				if (initial) navbar.openTab(searchDialog.shortTitle)
			} else {
				const dialog=getDialogFromQuery(query)
				if (!dialog) return
				navbar.openTab(dialog.shortTitle)
			}
		}
		function populateInputs(query: NoteQuery | undefined): void {
			searchDialog.populateInputs(query)
			bboxDialog.populateInputs(query)
			xmlDialog.populateInputs(query)
			plaintextDialog.populateInputs(query)
		}
		function startFetcherFromQuery(query: NoteQuery|undefined, clearStore: boolean, suppressFitNotes: boolean): void {
			if (!query) return
			const dialog=getDialogFromQuery(query)
			if (!dialog) return
			startFetcher(query,clearStore,suppressFitNotes,dialog)
		}
		function getDialogFromQuery(query: NoteQuery): NoteFetchDialog|undefined {
			if (query.mode=='search') {
				return searchDialog
			} else if (query.mode=='bbox') {
				return bboxDialog
			} else if (query.mode=='ids') {
				return plaintextDialog
			}
		}
		function startFetcher(
			query: NoteQuery, clearStore: boolean, suppressFitNotes: boolean, dialog: NoteFetchDialog
		): void {
			if (query.mode!='search' && query.mode!='bbox' && query.mode!='ids') return
			bboxDialog.resetFetch() // TODO run for all dialogs... for now only bboxDialog has meaningful action
			figureDialog.close()
			while (moreButtonIntersectionObservers.length>0) moreButtonIntersectionObservers.pop()?.disconnect()
			map.clearNotes()
			noteTable.reset()
			filterPanel.unsubscribe() // TODO still needed? table used to be reconstructed but now it's permanent
			filterPanel.subscribe(noteFilter=>noteTable.updateFilter(noteFilter))
			if (suppressFitNotes) {
				map.needToFitNotes=false
			}
			const environment: NoteFetcherEnvironment = {
				db,server,
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
		function handleSharedCheckboxes($checkboxes: HTMLInputElement[], stateChangeListener: (state:boolean)=>void) {
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
