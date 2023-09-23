import type {NoteFetchDialogSharedCheckboxes} from './base'
import {NoteQueryFetchDialog} from './base'
import type {Connection} from '../net'
import type NoteMap from '../map'
import type {NoteQuery} from '../query'
import {makeNoteBrowseQueryFromValues} from '../query'
import {makeLink, makeDiv} from '../util/html'
import {p,em,code} from '../util/html-shortcuts'

export class NoteBrowseFetchDialog extends NoteQueryFetchDialog {
	shortTitle=`Browse`
	title=`Get notes inside map view`
	private $trackMapZoomNotice=makeDiv('notice')()
	protected $bboxInput=document.createElement('input')
	constructor(
		$root: HTMLElement,
		$sharedCheckboxes: NoteFetchDialogSharedCheckboxes,
		cx: Connection,
		getRequestApiPaths: (query: NoteQuery, limit: number) => [type: string, apiPath: string][],
		submitQuery: (query: NoteQuery, isTriggeredBySubmitButton: boolean) => void,
		private map: NoteMap
	) {
		super($root,$sharedCheckboxes,cx,getRequestApiPaths,submitQuery)
	}
	get getAutoLoad(): ()=>boolean {
		return ()=>false
	}
	protected makeLeadAdvancedHint(): Array<string|HTMLElement> {
		return [p(
			`Make a `,makeLink(`notes in bounding box`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_notes_data_by_bounding_box:_GET_/api/0.6/notes`),
			` request at `,code(this.cx.server.api.getUrl(`notes?`),em(`parameters`)),` like the `,makeLink(`note layer`,`https://wiki.openstreetmap.org/wiki/Notes#Viewing_notes`),`; see `,em(`BBox`),` tab for `,em(`parameters`),` descriptions.`
		)]
	}
	protected writeScopeAndOrderFieldsetBeforeClosedLine($fieldset: HTMLFieldSetElement): void {
		{
			$fieldset.append(
				this.$trackMapZoomNotice
			)
		}{
			this.$bboxInput.type='hidden'
			this.$bboxInput.name='bbox'
			this.$bboxInput.required=true // otherwise could submit empty bbox without entering anything
			$fieldset.append(this.$bboxInput)
		}
	}
	protected getClosedLineNotesText(): string {
		return `most recently updated notes`
	}
	protected limitValues=[20,100,500,2500,10000]
	protected limitDefaultValue=100 // higher default limit because no progressive loads possible
	protected limitLeadText=`Download `
	protected limitLabelBeforeText=`at most `
	protected limitLabelAfterText=` notes`
	protected limitIsParameter=true
	protected writeDownloadModeFieldset($fieldset: HTMLFieldSetElement): void {
	}
	protected populateInputsWithoutUpdatingRequestExceptForClosedInput(query: NoteQuery | undefined): void {
		if (query && query.mode!='browse') return
		this.$bboxInput.value=query?.bbox ?? ''
	}
	protected get defaultClosedValue(): string {
		return '7'
	}
	protected addEventListenersBeforeClosedLine(): void {
		const updateTrackMapZoomNotice=()=>{
			if (this.map.zoom>=8) {
				this.$trackMapZoomNotice.classList.remove('error')
				this.$trackMapZoomNotice.innerText=`Fetching will stop on zooms lower than 8`
			} else {
				this.$trackMapZoomNotice.classList.add('error')
				this.$trackMapZoomNotice.innerText=`Fetching will start on zooms 8 or higher`
			}
		}
		const trackMap=()=>{
			updateTrackMapZoomNotice()
			this.setBbox(...this.map.precisionBounds.wsen)
		}
		updateTrackMapZoomNotice()
		this.$root.addEventListener('osmNoteViewer:mapMoveEnd',()=>{
			trackMap()
			this.updateNotesIfNeeded()
		})
	}
	protected onClosedValueChange(): void {
		this.updateNotesIfNeeded()
	}
	protected constructQuery(): NoteQuery | undefined {
		return makeNoteBrowseQueryFromValues(
			this.$bboxInput.value,this.closedValue
		)
	}
	protected listQueryChangingInputs(): Array<HTMLInputElement|HTMLSelectElement> {
		return [
			this.$bboxInput,this.$closedInput,this.$closedSelect
		]
	}
	onOpen(): void {
		this.map.freezeMode='full'
		this.updateNotesIfNeeded()
	}
	onClose(): void {
		this.map.freezeMode='no'
	}
	private updateNotesIfNeeded(): void {
		if (this.isOpen() && this.map.zoom>=8) {
			this.$form.requestSubmit()
		}
	}
	private setBbox(west:string,south:string,east:string,north:string): void {
		// (left,bottom,right,top)
		this.$bboxInput.value=west+','+south+','+east+','+north
		this.validateBbox()
		this.updateRequest()
	}
	private validateBbox(): boolean {
		const splitValue=this.$bboxInput.value.split(',')
		if (splitValue.length!=4) {
			this.$bboxInput.setCustomValidity(`must contain four comma-separated values`)
			return false
		}
		for (const number of splitValue) {
			if (!isFinite(Number(number))) {
				this.$bboxInput.setCustomValidity(`values must be numbers, "${number}" is not a number`)
				return false
			}
		}
		this.$bboxInput.setCustomValidity('')
		return true
	}
	protected getQueryCaptionItems(query: NoteQuery) {
		if (query.mode!='browse') return []
		return [
			[`inside bounding box `,query.bbox]
		]
	}
}
