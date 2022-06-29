import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import {NoteMap} from './map'
import Navbar from './navbar'
import FigureDialog from './figure'
import NoteTable from './table'
import NoteFilterPanel from './filter-panel'
import ToolPanel from './tool-panel'
import {NoteQuery, makeNoteQueryFromHash, makeNoteQueryString} from './query'
import {NoteFetcher, NoteSearchFetcher, NoteBboxFetcher, NoteIdsFetcher} from './fetch'
import {NoteFetchDialogSharedCheckboxes,
	NoteFetchDialog, NoteSearchFetchDialog, NoteBboxFetchDialog, NoteXmlFetchDialog, NotePlaintextFetchDialog
} from './fetch-dialog'

export default class NoteFetchPanel {
	constructor(
		storage: NoteViewerStorage, db: NoteViewerDB,
		$container: HTMLElement,
		$notesContainer: HTMLElement, $moreContainer: HTMLElement, $toolContainer: HTMLElement,
		navbar: Navbar,
		filterPanel: NoteFilterPanel, map: NoteMap, figureDialog: FigureDialog, restoreScrollPosition: ()=>void
	) {
		let noteTable: NoteTable | undefined
		const moreButtonIntersectionObservers: IntersectionObserver[] = []
		const $sharedCheckboxes: NoteFetchDialogSharedCheckboxes = {
			showImages: [],
			showRequests: []
		}
		const hashQuery=makeNoteQueryFromHash(location.hash)

		// make fetchers and dialogs
		const searchFetcher=new NoteSearchFetcher()
		const bboxFetcher=new NoteBboxFetcher()
		const idsFetcher=new NoteIdsFetcher()
		const makeSearchDialog = (
			fetcher: NoteFetcher,
			fetchDialogCtor: (
				getRequestUrls: (query: NoteQuery, limit: number) => [type: string, url: string][],
				submitQuery: (query: NoteQuery) => void
			) => NoteFetchDialog
		): NoteFetchDialog => {
			const dialog=fetchDialogCtor((query,limit)=>fetcher.getRequestUrls(query,limit),(query)=>{
				modifyHistory(query,true)
				startFetcher(query,true,fetcher,dialog)
			})
			dialog.$limitSelect.addEventListener('input',()=>searchFetcher.limitWasUpdated())
			dialog.write($container,$sharedCheckboxes,hashQuery)
			navbar.addTab(dialog.shortTitle,dialog.$section)
			return dialog
		}
		const searchDialog=makeSearchDialog(searchFetcher,(getRequestUrls,submitQuery)=>new NoteSearchFetchDialog(getRequestUrls,submitQuery))
		const bboxDialog=makeSearchDialog(bboxFetcher,(getRequestUrls,submitQuery)=>new NoteBboxFetchDialog(getRequestUrls,submitQuery,map))
		const xmlDialog=makeSearchDialog(idsFetcher,(getRequestUrls,submitQuery)=>new NoteXmlFetchDialog(getRequestUrls,submitQuery))
		const plaintextDialog=makeSearchDialog(idsFetcher,(getRequestUrls,submitQuery)=>new NotePlaintextFetchDialog(getRequestUrls,submitQuery))
		
		handleSharedCheckboxes($sharedCheckboxes.showImages,state=>noteTable?.setShowImages(state))
		handleSharedCheckboxes($sharedCheckboxes.showRequests,state=>{
			$container.classList.toggle('show-requests',state)
			$moreContainer.classList.toggle('show-requests',state)
		})
		window.addEventListener('hashchange',()=>{
			const query=makeNoteQueryFromHash(location.hash)
			openQueryDialog(query,false)
			modifyHistory(query,false) // in case location was edited manually
			populateInputs(query)
			startFetcherFromQuery(query,false)
			restoreScrollPosition()
		})
		openQueryDialog(hashQuery,true)
		modifyHistory(hashQuery,false)
		startFetcherFromQuery(hashQuery,false)
		function openQueryDialog(query: NoteQuery | undefined, initial: boolean): void {
			if (!query) {
				if (initial) navbar.openTab(searchDialog.shortTitle)
			} else {
				const fetcherAndDialog=getFetcherAndDialogFromQuery(query)
				if (!fetcherAndDialog) return
				const [,dialog]=fetcherAndDialog
				navbar.openTab(dialog.shortTitle)
			}
		}
		function populateInputs(query: NoteQuery | undefined): void {
			searchDialog.populateInputs(query)
			bboxDialog.populateInputs(query)
			xmlDialog.populateInputs(query)
			plaintextDialog.populateInputs(query)
		}
		function resetNoteDependents(): void {
			while (moreButtonIntersectionObservers.length>0) moreButtonIntersectionObservers.pop()?.disconnect()
			map.clearNotes()
			$notesContainer.innerHTML=``
			$toolContainer.innerHTML=``
		}
		function startFetcherFromQuery(query: NoteQuery|undefined, clearStore: boolean): void {
			if (!query) return
			const fetcherAndDialog=getFetcherAndDialogFromQuery(query)
			if (!fetcherAndDialog) return
			startFetcher(query,clearStore,...fetcherAndDialog)
		}
		function getFetcherAndDialogFromQuery(query: NoteQuery): [NoteFetcher,NoteFetchDialog]|undefined {
			if (query.mode=='search') {
				return [searchFetcher,searchDialog]
			} else if (query.mode=='bbox') {
				return [bboxFetcher,bboxDialog]
			} else if (query.mode=='ids') {
				return [idsFetcher,plaintextDialog]
			}
		}
		function startFetcher(query: NoteQuery, clearStore: boolean, fetcher: NoteFetcher, dialog: NoteFetchDialog): void {
			figureDialog.close()
			resetNoteDependents()
			if (query.mode!='search' && query.mode!='bbox' && query.mode!='ids') return
			filterPanel.unsubscribe()
			const toolPanel=new ToolPanel($toolContainer,map,figureDialog,storage)
			noteTable=new NoteTable(
				$notesContainer,toolPanel,map,filterPanel.noteFilter,
				figureDialog,$sharedCheckboxes.showImages[0]?.checked
			)
			filterPanel.subscribe(noteFilter=>noteTable?.updateFilter(noteFilter))
			if (dialog.needToSuppressFitNotes()) map.needToFitNotes=false
			fetcher.start(
				db,
				noteTable,$moreContainer,
				dialog.$limitSelect,dialog.getAutoLoadChecker(),
				(disabled: boolean) => dialog.disableFetchControl(disabled),
				moreButtonIntersectionObservers,
				query,
				clearStore
			)
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
	}
}

function modifyHistory(query: NoteQuery | undefined, push: boolean): void {
	let canonicalQueryHash=''
	if (query) {
		const queryString=makeNoteQueryString(query)
		if (queryString) canonicalQueryHash='#'+queryString
	}
	if (canonicalQueryHash!=location.hash) {
		const url=canonicalQueryHash||location.pathname+location.search
		if (push) {
			history.pushState(null,'',url)
		} else {
			history.replaceState(null,'',url)
		}
	}
}
