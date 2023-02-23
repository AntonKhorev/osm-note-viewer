import type NoteViewerDB from './db'
import type Auth from './auth'
import type NoteMap from './map'
import type Navbar from './navbar'
import type NoteTable from './table'
import type {NoteQuery, NoteSearchQuery} from './query' 
import {makeNoteQueryFromHash, makeNoteQueryString} from './query'
import type {NoteFetcherEnvironment, NoteFetcherRun} from './fetch'
import {NoteSearchFetcherRun, NoteBboxFetcherRun, NoteIdsFetcherRun} from './fetch'
import type {NoteFetchDialog} from './fetch-dialog'
import NoteFetchDialogs from './fetch-dialog'
import {bubbleCustomEvent} from './html'

export default class NoteFetchPanel {
	// TODO have invoking dialog object; react only on dl params change in it; display that fieldset differently
	fetcherRun?: NoteFetcherRun
	private fetcherInvoker?: NoteFetchDialog
	constructor(
		$root: HTMLElement,
		db: NoteViewerDB, auth: Auth,
		$container: HTMLElement, $moreContainer: HTMLElement,
		navbar: Navbar, noteTable: NoteTable, map: NoteMap,
		queryHash: string, hasMapHash: boolean, hostHashValue: string|null
	) {
		const self=this
		const moreButtonIntersectionObservers: IntersectionObserver[] = []
		const hashQuery=makeNoteQueryFromHash(queryHash)

		const fetchDialogs=new NoteFetchDialogs(
			$root,auth,$container,$moreContainer,noteTable,map,hashQuery,
			(dialog:NoteFetchDialog,query:NoteQuery)=>{
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

		$root.addEventListener('osmNoteViewer:queryHashChange',({detail:queryHash})=>{
			const query=makeNoteQueryFromHash(queryHash)
			openQueryDialog(navbar,fetchDialogs,query,false)
			fetchDialogs.populateInputs(query)
			startFetcherFromQuery(query,false,false)
		})
		openQueryDialog(navbar,fetchDialogs,hashQuery,true)
		startFetcherFromQuery(
			hashQuery,false,
			hasMapHash // when just opened a note-viewer page with map hash set - if query is set too, don't fit its result, keep the map hash
		)

		$root.addEventListener('osmNoteViewer:userLinkClick',ev=>{
			if (!(ev.target instanceof HTMLElement)) return
			const query: NoteSearchQuery = {
				mode: 'search',
				closed: -1,
				sort: 'created_at',
				order: 'newest',
			}
			if (ev.target.dataset.userName) {
				query.display_name=ev.target.dataset.userName
			} else {
				query.user=Number(ev.target.dataset.userId)
			}
			openQueryDialog(navbar,fetchDialogs,query,false)
			fetchDialogs.populateInputs(query)
			fetchDialogs.searchDialog.$section.scrollIntoView()
		})
		$root.addEventListener('osmNoteViewer:noteFetch',({detail:[note,users]})=>{
			this.fetcherRun?.updateNote(note,users)
		})
		
		function startFetcherFromQuery(query: NoteQuery|undefined, isNewStart: boolean, suppressFitNotes: boolean): void {
			if (!query) return
			const dialog=fetchDialogs.getDialogFromQuery(query)
			if (!dialog) return
			startFetcher(query,isNewStart,suppressFitNotes,dialog)
		}
		function startFetcher(
			query: NoteQuery, isNewStart: boolean, suppressFitNotes: boolean, dialog: NoteFetchDialog
		): void {
			if (query.mode!='search' && query.mode!='bbox' && query.mode!='ids') return
			while (moreButtonIntersectionObservers.length>0) moreButtonIntersectionObservers.pop()?.disconnect()
			if (map) {
				map.clearNotes()
				if (suppressFitNotes) {
					map.needToFitNotes=false
				}
			}
			const $caption=dialog.getQueryCaption(query)
			document.title=($caption.textContent??'')+` | note-viewer`
			$caption.onclick=ev=>{
				const $a=ev.target
				if (!($a instanceof HTMLAnchorElement)) return
				if (!$a.dataset.inputName) return
				const $input=dialog.$form.elements.namedItem($a.dataset.inputName)
				if (!($input instanceof HTMLInputElement || $input instanceof HTMLTextAreaElement)) return
				$input.focus()
				ev.preventDefault()
				ev.stopPropagation()
			}
			$caption.onkeydown=ev=>{
				const $a=ev.target
				if (!($a instanceof HTMLAnchorElement)) return
				$a.click()
				ev.preventDefault()
				ev.stopPropagation()
			}
			noteTable.reset($caption)
			bubbleCustomEvent($container,'osmNoteViewer:newNoteStream',[makeNoteQueryString(query),isNewStart])
			const environment: NoteFetcherEnvironment = {
				db,
				api: auth.server.api,
				hostHashValue,
				noteTable,$moreContainer,
				getLimit: dialog.getLimit,
				getAutoLoad: dialog.getAutoLoad,
				blockDownloads: (disabled: boolean) => dialog.disableFetchControl(disabled),
				moreButtonIntersectionObservers,
			}
			self.fetcherInvoker=dialog
			if (query.mode=='search') {
				self.fetcherRun=new NoteSearchFetcherRun(environment,query,isNewStart)
			} else if (query.mode=='bbox') {
				self.fetcherRun=new NoteBboxFetcherRun(environment,query,isNewStart)
			} else if (query.mode=='ids') {
				self.fetcherRun=new NoteIdsFetcherRun(environment,query,isNewStart)
			}
		}
	}
}

function openQueryDialog(
	navbar: Navbar, fetchDialogs: NoteFetchDialogs,
	query: NoteQuery | undefined, initial: boolean
): void {
	if (!query) {
		if (initial) navbar.openTab(fetchDialogs.searchDialog)
	} else {
		const dialog=fetchDialogs.getDialogFromQuery(query)
		if (!dialog) return
		navbar.openTab(dialog)
	}
}
