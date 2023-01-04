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
import {NoteFetcherEnvironment, NoteFetcherRun, NoteSearchFetcherRun, NoteBboxFetcherRun, NoteIdsFetcherRun} from './fetch'
import NoteFetchDialogs, {NoteFetchDialog} from './fetch-dialog'

export default class NoteFetchPanel {
	// TODO have invoking dialog object; react only on dl params change in it; display that fieldset differently
	private fetcherRun?: NoteFetcherRun
	private fetcherInvoker?: NoteFetchDialog
	constructor(
		storage: NoteViewerStorage, db: NoteViewerDB, server: Server|undefined, serverList: ServerList,
		globalEventsListener: GlobalEventsListener, globalHistory: GlobalHistory,
		$container: HTMLElement, $moreContainer: HTMLElement,
		navbar: Navbar, noteTable: NoteTable|undefined, map: NoteMap|undefined, figureDialog: FigureDialog|undefined
	) {
		const self=this
		const moreButtonIntersectionObservers: IntersectionObserver[] = []
		const hashQuery=makeNoteQueryFromHash(globalHistory.getQueryHash())

		let fetchDialogs: NoteFetchDialogs|undefined
		if (server && noteTable && map) {
			fetchDialogs=new NoteFetchDialogs(
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
			modifyHistory(query,false) // in case location was edited manually
			if (fetchDialogs) {
				openQueryDialog(navbar,fetchDialogs,query,false)
				fetchDialogs.populateInputs(query)
			}
			startFetcherFromQuery(query,false,false)
			globalHistory.restoreScrollPosition()
		}
		if (fetchDialogs) {
			openQueryDialog(navbar,fetchDialogs,hashQuery,true)
		} else {
			navbar.openTab('About')
		}
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
			if (fetchDialogs) {
				openQueryDialog(navbar,fetchDialogs,query,false)
				fetchDialogs.populateInputs(query)
				fetchDialogs.searchDialog.$section.scrollIntoView()
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

function openQueryDialog(
	navbar: Navbar, fetchDialogs: NoteFetchDialogs,
	query: NoteQuery | undefined, initial: boolean
): void {
	if (!query) {
		if (initial) navbar.openTab(fetchDialogs.searchDialog.shortTitle)
	} else {
		const dialog=fetchDialogs.getDialogFromQuery(query)
		if (!dialog) return
		navbar.openTab(dialog.shortTitle)
	}
}
