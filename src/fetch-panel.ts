import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import {NoteMap} from './map'
import FigureDialog from './figure'
import NoteTable from './table'
import NoteFilterPanel from './filter-panel'
import ExtrasPanel from './extras-panel'
import ToolPanel from './tool-panel'
import {NoteQuery, makeNoteQueryFromHash, makeNoteQueryString} from './query'
import {toReadableDate} from './query-date'
import {NoteSearchFetcher, NoteBboxFetcher} from './fetch'
import {NoteFetchDialogSharedCheckboxes, NoteSearchFetchDialog, NoteBboxFetchDialog} from './fetch-dialog'

export default class NoteFetchPanel {
	constructor(
		storage: NoteViewerStorage, db: NoteViewerDB,
		$container: HTMLElement,
		$notesContainer: HTMLElement, $moreContainer: HTMLElement, $toolContainer: HTMLElement,
		filterPanel: NoteFilterPanel, extrasPanel: ExtrasPanel, map: NoteMap, figureDialog: FigureDialog, restoreScrollPosition: ()=>void
	) {
		let noteTable: NoteTable | undefined
		const moreButtonIntersectionObservers: IntersectionObserver[] = []
		const $sharedCheckboxes: NoteFetchDialogSharedCheckboxes = {
			showImages: [],
			showRequests: []
		}
		const searchDialog=new NoteSearchFetchDialog()
		searchDialog.write($container,$sharedCheckboxes,query=>{
			modifyHistory(query,true)
			runStartFetcher(query,true)
		})
		const searchFetcher=new NoteSearchFetcher()
		const bboxDialog=new NoteBboxFetchDialog(map)
		bboxDialog.write($container,$sharedCheckboxes,query=>{
			modifyHistory(query,true)
			runStartFetcher(query,true)
		})
		const bboxFetcher=new NoteBboxFetcher()
		handleSharedCheckboxes($sharedCheckboxes.showImages,state=>noteTable?.setShowImages(state))
		handleSharedCheckboxes($sharedCheckboxes.showRequests,state=>$container.classList.toggle('show-requests',state))
		window.addEventListener('hashchange',()=>{
			const query=makeNoteQueryFromHash(location.hash)
			openQueryDialog(query,false)
			modifyHistory(query,false) // in case location was edited manually
			populateInputs(query)
			runStartFetcher(query,false)
			restoreScrollPosition()
		})
		const query=makeNoteQueryFromHash(location.hash)
		openQueryDialog(query,true)
		modifyHistory(query,false)
		populateInputs(query)
		runStartFetcher(query,false)
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
			if (!query || query.mode=='search') {
				if (query?.display_name) {
					searchDialog.$userInput.value=query.display_name
				} else if (query?.user) {
					searchDialog.$userInput.value='#'+query.user
				} else {
					searchDialog.$userInput.value=''
				}
				searchDialog.$textInput.value=query?.q ?? ''
				searchDialog.$fromInput.value=toReadableDate(query?.from)
				searchDialog.$toInput.value=toReadableDate(query?.to)
				searchDialog.$statusSelect.value=query ? String(query.closed) : '-1'
				searchDialog.$sortSelect.value=query?.sort ?? 'created_at'
				searchDialog.$orderSelect.value=query?.order ?? 'newest'
			}
			if (!query || query.mode=='bbox') {
				bboxDialog.$bboxInput.value=query?.bbox ?? ''
				bboxDialog.$statusSelect.value=query ? String(query.closed) : '-1'
			}
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
			if (query?.mode=='search') {
				extrasPanel.rewrite(query,Number(searchDialog.$limitSelect.value))
			} else {
				extrasPanel.rewrite()
			}
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
					searchDialog.$limitSelect,searchDialog.$autoLoadCheckbox,searchDialog.$fetchButton,
					moreButtonIntersectionObservers,
					query,
					clearStore
				)
			} else if (query?.mode=='bbox') {
				if (bboxDialog.$trackMapCheckbox.checked) map.needToFitNotes=false
				bboxFetcher.start(
					db,
					noteTable,$moreContainer,
					bboxDialog.$limitSelect,{checked:false},bboxDialog.$fetchButton,
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
	const canonicalQueryHash = query ? '#'+makeNoteQueryString(query) : ''
	if (canonicalQueryHash!=location.hash) {
		const url=canonicalQueryHash||location.pathname+location.search
		if (push) {
			history.pushState(null,'',url)
		} else {
			history.replaceState(null,'',url)
		}
	}
}
