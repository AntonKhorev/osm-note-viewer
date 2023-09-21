import type {NoteFetchDialogSharedCheckboxes} from './base'
import {NoteQueryFetchDialog} from './base'
import type {Connection} from '../net'
import type NoteMap from '../map'
import type {NoteQuery} from '../query'
import {makeNoteBrowseQueryFromValues} from '../query'
import {makeElement, makeLink, makeDiv, makeLabel} from '../util/html'
import {p,em,code} from '../util/html-shortcuts'

const rq=(param: string)=>makeElement('span')('advanced-hint')(` (`,code(param),` parameter)`)
const spanRequest=(...ss: Array<string|HTMLElement>)=>makeElement('span')('advanced-hint')(...ss)

export class NoteBrowseFetchDialog extends NoteQueryFetchDialog {
	shortTitle=`Browse`
	title=`Get notes inside map view`
	private $trackMapZoomNotice=makeDiv('notice')()
	protected $bboxInput=document.createElement('input')
	private mapBoundsForFreezeRestore: L.LatLngBounds|undefined
	constructor(
		$root: HTMLElement,
		$sharedCheckboxes: NoteFetchDialogSharedCheckboxes,
		cx: Connection,
		getRequestApiPaths: (query: NoteQuery, limit: number) => [type: string, apiPath: string][],
		submitQuery: (query: NoteQuery) => void,
		private map: NoteMap
	) {
		super($root,$sharedCheckboxes,cx,getRequestApiPaths,submitQuery)
	}
	resetFetch() {
		this.mapBoundsForFreezeRestore=undefined
	}
	get getAutoLoad(): ()=>boolean {
		return ()=>false
	}
	populateInputs(query: NoteQuery|undefined): void {
		super.populateInputs(query)
	}
	protected makeLeadAdvancedHint(): Array<string|HTMLElement> {
		return [p(
			`Get `,makeLink(`notes by bounding box`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_notes_data_by_bounding_box:_GET_/api/0.6/notes`),
			` request at `,code(this.cx.server.api.getUrl(`notes?`),em(`parameters`)),`; see `,em(`parameters`),` below.`
		)]
	}
	protected listParameters(closedDescriptionItems: Array<string|HTMLElement>): [parameter: string, $input: HTMLElement, descriptionItems: Array<string|HTMLElement>][] {
		return [
			['bbox',this.$bboxInput,[
				`Bounding box. `,
				`Expect `,em(`The maximum bbox size is ..., and your request was too large`),` error if the bounding box is too large.`
			]],
			['limit',this.$limitInput,[
				`Max number of notes to fetch. `,
				`For `,em(`bbox`),` mode is corresponds to a total number of notes, not just a batch size. `,
				`It's impossible to download additional batches of notes because the API call used by this mode lacks date range parameters.`
			]],
			['closed',this.$closedInput,closedDescriptionItems],
		]
	}
	protected writeScopeAndOrderFieldsetBeforeClosedLine($fieldset: HTMLFieldSetElement): void {
		{
			$fieldset.append(
				this.$trackMapZoomNotice
			)
		}{
			this.$bboxInput.type='text'
			this.$bboxInput.name='bbox'
			this.$bboxInput.required=true // otherwise could submit empty bbox without entering anything
			$fieldset.append(makeDiv('major-input-group')(makeLabel()(
				`Bounding box (`,
				tip(`left`,`western-most (min) longitude`),`, `,
				tip(`bottom`,`southern-most (min) latitude`),`, `,
				tip(`right`,`eastern-most (max) longitude`),`, `,
				tip(`top`,`northern-most (max) latitude`),
				`)`,rq('bbox'),spanRequest(` (also `,code('west'),`, `,code('south'),`, `,code('east'),`, `,code('north'),` Nominatim parameters)`),` `,
				this.$bboxInput
			)))
			function tip(text: string, title: string) {
				const $span=document.createElement('span')
				$span.textContent=text
				$span.title=title
				return $span
			}
		}
	}
	appendToClosedLine($div: HTMLElement): void {
		$div.append(
			` `,
			`sorted by last update date `,
			`newest first`
		)
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
		if (query && query.mode!='bbox') return
		this.$bboxInput.value=query?.bbox ?? ''
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
		const updateNotesIfNeeded=()=>{
			if (this.isOpen() && this.map.zoom>=8) {
				this.$form.requestSubmit()
			}
		}
		updateTrackMapZoomNotice()
		this.$root.addEventListener('osmNoteViewer:mapMoveEnd',()=>{
			trackMap()
			if (this.isOpen() && this.mapBoundsForFreezeRestore) {
				this.mapBoundsForFreezeRestore=undefined
			} else {
				updateNotesIfNeeded()
			}
		})
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
		// TODO fetch right away
		if (this.mapBoundsForFreezeRestore) {
			this.map.fitBounds(this.mapBoundsForFreezeRestore) // assumes map is not yet frozen
			// this.restoreMapBoundsForFreeze=undefined to be done in map move end listener
		} else {
			this.mapBoundsForFreezeRestore=undefined
		}
		this.map.freezeMode='full'
	}
	onClose(): void {
		this.mapBoundsForFreezeRestore=this.map.bounds
		this.map.freezeMode='no'
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
