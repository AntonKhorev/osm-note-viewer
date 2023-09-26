import type NoteFetchDialog from './base'
import type {NoteFetchDialogSharedCheckboxes} from './base'
import NoteSearchFetchDialog from './search'
import NoteBboxFetchDialog from './bbox'
import NoteXmlFetchDialog from './xml'
import NoteIdsFetchDialog from './ids'
import NoteBrowseFetchDialog from './browse'
import type {Connection} from '../net'
import type NoteMap from '../map'
import type NoteTable from '../table'
import type {NoteQuery} from '../query'
import {NoteFetcherRequest, NoteSearchFetcherRequest, NoteBboxFetcherRequest, NoteIdsFetcherRequest} from '../fetch'

export {NoteFetchDialog}

export default class NoteFetchDialogs {
	searchDialog: NoteFetchDialog
	bboxDialog: NoteFetchDialog
	xmlDialog: NoteFetchDialog
	idsDialog: NoteFetchDialog
	browseDialog: NoteFetchDialog
	constructor(
		$root: HTMLElement,
		cx: Connection,
		$container: HTMLElement, $moreContainer: HTMLElement,
		noteTable: NoteTable, map: NoteMap,
		submitQueryFromDialog: (dialog: NoteFetchDialog, query: NoteQuery, isTriggeredBySubmitButton: boolean) => void,
		limitChangeListener: (dialog: NoteFetchDialog) => void,
	) {
		const $sharedCheckboxes: NoteFetchDialogSharedCheckboxes = {
			showImages: [],
			advancedMode: []
		}
		const makeFetchDialog = (
			fetcherRequest: NoteFetcherRequest,
			fetchDialogCtor: (
				getRequestApiPaths: (query: NoteQuery, limit: number) => [type: string, apiPath: string][],
				submitQuery: (query: NoteQuery, isTriggeredBySubmitButton: boolean) => void
			) => NoteFetchDialog
		): NoteFetchDialog => {
			const dialog=fetchDialogCtor(
				(query,limit)=>fetcherRequest.getRequestApiPaths(query,limit),
				(query,isTriggeredBySubmitButton)=>submitQueryFromDialog(dialog,query,isTriggeredBySubmitButton)
			)
			dialog.limitChangeListener=()=>limitChangeListener(dialog)
			dialog.write($container)
			return dialog
		}
		this.searchDialog=makeFetchDialog(
			new NoteSearchFetcherRequest,
			(getRequestApiPaths,submitQuery)=>new NoteSearchFetchDialog($root,$sharedCheckboxes,cx,getRequestApiPaths,submitQuery)
		)
		this.bboxDialog=makeFetchDialog(
			new NoteBboxFetcherRequest,
			(getRequestApiPaths,submitQuery)=>new NoteBboxFetchDialog($root,$sharedCheckboxes,cx,getRequestApiPaths,submitQuery,map)
		)
		this.xmlDialog=makeFetchDialog(
			new NoteIdsFetcherRequest,
			(getRequestApiPaths,submitQuery)=>new NoteXmlFetchDialog($root,$sharedCheckboxes,cx,getRequestApiPaths,submitQuery)
		)
		this.idsDialog=makeFetchDialog(
			new NoteIdsFetcherRequest,
			(getRequestApiPaths,submitQuery)=>new NoteIdsFetchDialog($root,$sharedCheckboxes,cx,getRequestApiPaths,submitQuery,noteTable)
		)
		this.browseDialog=makeFetchDialog(
			new NoteBboxFetcherRequest,
			(getRequestApiPaths,submitQuery)=>new NoteBrowseFetchDialog($root,$sharedCheckboxes,cx,getRequestApiPaths,submitQuery,map)
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

		$root.addEventListener('osmNoteViewer:newNoteStream',()=>{
			for (const dialog of this.allDialogs) {
				dialog.resetFetch()
			}
		})
	}
	get allDialogs() {
		return [this.searchDialog,this.bboxDialog,this.xmlDialog,this.idsDialog,this.browseDialog]
	}
	populateInputs(query: NoteQuery | undefined): void {
		for (const dialog of this.allDialogs) {
			dialog.populateInputs(query)
		}
	}
	getDialogFromQuery(query: NoteQuery): NoteFetchDialog|undefined {
		if (query.mode=='search') {
			return this.searchDialog
		} else if (query.mode=='bbox') {
			return this.bboxDialog
		} else if (query.mode=='ids') {
			return this.idsDialog
		} else if (query.mode=='browse') {
			return this.browseDialog
		}
	}
}
