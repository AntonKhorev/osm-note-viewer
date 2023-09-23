import type NoteViewerDB from './db'
import type {Connection} from './net'
import type NoteMap from './map'
import type Navbar from './navbar'
import type NoteTable from './table'
import type {NoteQuery, NoteSearchQuery} from './query' 
import {makeNoteQueryFromHash, makeNoteQueryString} from './query'
import type {NoteFetcherEnvironment, NoteFetcherRun} from './fetch'
import {NoteSearchFetcherRun, NoteBboxFetcherRun, NoteIdsFetcherRun} from './fetch'
import type {NoteFetchDialog} from './fetch-dialog'
import NoteFetchDialogs from './fetch-dialog'
import {bubbleCustomEvent} from './util/events'

export default class NoteFetchPanel {
	// TODO have invoking dialog object; react only on dl params change in it; display that fieldset differently
	fetcherRun?: NoteFetcherRun
	private fetcherInvoker?: NoteFetchDialog
	constructor(
		$root: HTMLElement,
		db: NoteViewerDB, cx: Connection,
		$container: HTMLElement, $moreContainer: HTMLElement,
		navbar: Navbar, noteTable: NoteTable, map: NoteMap,
		hostHashValue: string|null, queryHash: string,
		hasMapHash: ()=>boolean // to see in no-fetch-click queries need to fit the notes
	) {
		const self=this
		const moreButtonIntersectionObservers: IntersectionObserver[] = []
		const hashQuery=makeNoteQueryFromHash(queryHash)

		const fetchDialogs=new NoteFetchDialogs(
			$root,cx,$container,$moreContainer,noteTable,map,hashQuery,startFetcher,
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
			startFetcherFromQuery(query)
		})
		openQueryDialog(navbar,fetchDialogs,hashQuery,true)
		startFetcherFromQuery(hashQuery)

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
		
		function startFetcherFromQuery(query: NoteQuery|undefined): void {
			if (!query) return
			const dialog=fetchDialogs.getDialogFromQuery(query)
			if (!dialog) return
			dialog.fetchIfValid()
		}
		function startFetcher(
			dialog: NoteFetchDialog, query: NoteQuery, isNewHistoryEntry: boolean
		): void {
			if (query.mode!='search' && query.mode!='bbox' && query.mode!='browse' && query.mode!='ids') return
			if (query.mode=='browse') isNewHistoryEntry=false // keep the map hash because there's no bbox parameter and no query hash at all
			while (moreButtonIntersectionObservers.length>0) moreButtonIntersectionObservers.pop()?.disconnect()
			if (map) {
				map.clearNotes()
				if (!isNewHistoryEntry && hasMapHash()) map.needToFitNotes=false
			}
			const $caption=dialog.getQueryCaption(query)
			document.title=($caption.textContent??'')+` | note-viewer`
			$caption.prepend(`Fetched `)
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
			noteTable.reset($caption,getMarkUser(query),getMarkText(query))
			bubbleCustomEvent($container,'osmNoteViewer:newNoteStream',[makeNoteQueryString(query),isNewHistoryEntry])
			const environment: NoteFetcherEnvironment = {
				db,
				api: cx.server.api,
				token: cx.token,
				hostHashValue,
				noteTable,$moreContainer,
				getLimit: dialog.getLimit,
				getAutoLoad: dialog.getAutoLoad,
				blockDownloads: (disabled: boolean) => dialog.disableFetchControl(disabled),
				moreButtonIntersectionObservers,
			}
			self.fetcherInvoker=dialog
			if (query.mode=='search') {
				self.fetcherRun=new NoteSearchFetcherRun(environment,query,isNewHistoryEntry)
			} else if (query.mode=='bbox' || query.mode=='browse') {
				self.fetcherRun=new NoteBboxFetcherRun(environment,query,isNewHistoryEntry)
			} else if (query.mode=='ids') {
				self.fetcherRun=new NoteIdsFetcherRun(environment,query,isNewHistoryEntry)
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

function getMarkUser(query: NoteQuery): string|number|undefined {
	if (query.mode!='search') return
	return query.display_name ?? query.user
}

function getMarkText(query: NoteQuery): string|undefined {
	if (query.mode!='search') return
	return query.q
}
