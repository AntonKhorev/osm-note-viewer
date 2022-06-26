import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import {NoteMap} from './map'
import FigureDialog from './figure'
import NoteTable from './table'
import NoteFilterPanel from './filter-panel'
import ToolPanel from './tool-panel'
import {NoteQuery, makeNoteQueryFromHash, makeNoteQueryString} from './query'
import {NoteSearchFetcher, NoteBboxFetcher} from './fetch'
import {NoteFetchDialogSharedCheckboxes, NoteSearchFetchDialog, NoteBboxFetchDialog, NoteXmlFetchDialog} from './fetch-dialog'

export default class NoteFetchPanel {
	constructor(
		storage: NoteViewerStorage, db: NoteViewerDB,
		$container: HTMLElement,
		$notesContainer: HTMLElement, $moreContainer: HTMLElement, $toolContainer: HTMLElement,
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
		const searchDialog=new NoteSearchFetchDialog((query,limit)=>searchFetcher.getRequestUrls(query,limit),(query)=>{
			modifyHistory(query,true)
			runStartFetcher(query,true)
		})
		searchDialog.$limitSelect.addEventListener('input',()=>searchFetcher.limitWasUpdated())
		searchDialog.write($container,$sharedCheckboxes,hashQuery)
		const bboxFetcher=new NoteBboxFetcher()
		const bboxDialog=new NoteBboxFetchDialog((query,limit)=>bboxFetcher.getRequestUrls(query,limit),(query)=>{
			modifyHistory(query,true)
			runStartFetcher(query,true)
		},map)
		bboxDialog.$limitSelect.addEventListener('input',()=>bboxFetcher.limitWasUpdated())
		bboxDialog.write($container,$sharedCheckboxes,hashQuery)
		// const idsFetcher=new NoteIdsFetcher() // TODO
		const xmlDialog=new NoteXmlFetchDialog((query,limit)=>[],(query)=>{
			modifyHistory(query,true)
			console.log(`TODO run fetcher for query`,query) // runStartFetcher(query,true)
		})
		// xmlDialog.$limitSelect.addEventListener('input',()=>idsFetcher.limitWasUpdated())
		xmlDialog.write($container,$sharedCheckboxes,hashQuery)
		
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
			runStartFetcher(query,false)
			restoreScrollPosition()
		})
		openQueryDialog(hashQuery,true)
		modifyHistory(hashQuery,false)
		runStartFetcher(hashQuery,false)
		function openQueryDialog(query: NoteQuery | undefined, initial: boolean): void {
			if (!query) {
				if (initial) searchDialog.open()
			} else if (query.mode=='search') {
				searchDialog.open()
			} else if (query.mode=='bbox') {
				bboxDialog.open()
			}
		}
		function populateInputs(query: NoteQuery | undefined): void {
			searchDialog.populateInputs(query)
			bboxDialog.populateInputs(query)
		}
		function resetNoteDependents() {
			while (moreButtonIntersectionObservers.length>0) moreButtonIntersectionObservers.pop()?.disconnect()
			map.clearNotes()
			$notesContainer.innerHTML=``
			$toolContainer.innerHTML=``
		}
		function runStartFetcher(query: NoteQuery | undefined, clearStore: boolean): void {
			figureDialog.close()
			resetNoteDependents()
			if (query?.mode!='search' && query?.mode!='bbox') return
			filterPanel.unsubscribe()
			const toolPanel=new ToolPanel($toolContainer,map,figureDialog,storage)
			noteTable=new NoteTable(
				$notesContainer,toolPanel,map,filterPanel.noteFilter,
				figureDialog,$sharedCheckboxes.showImages[0]?.checked
			)
			filterPanel.subscribe(noteFilter=>noteTable?.updateFilter(noteFilter))
			if (query?.mode=='search') {
				searchFetcher.start(
					db,
					noteTable,$moreContainer,
					searchDialog.$limitSelect,searchDialog.$autoLoadCheckbox,
					(disabled: boolean) => searchDialog.$fetchButton.disabled=disabled,
					moreButtonIntersectionObservers,
					query,
					clearStore
				)
			} else if (query?.mode=='bbox') {
				if (bboxDialog.$trackMapCheckbox.checked) map.needToFitNotes=false
				bboxFetcher.start(
					db,
					noteTable,$moreContainer,
					bboxDialog.$limitSelect,{checked:false},
					(disabled: boolean) => bboxDialog.$fetchButton.disabled=disabled,
					moreButtonIntersectionObservers,
					query,
					clearStore
				)
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
