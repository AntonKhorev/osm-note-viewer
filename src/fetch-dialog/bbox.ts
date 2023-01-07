import {NoteQueryFetchDialog, NoteFetchDialogSharedCheckboxes} from './base'
import NominatimSubForm from './bbox-nominatim'
import Server from '../server'
import NoteMap, {NoteMapFreezeMode} from '../map'
import {NoteQuery, makeNoteBboxQueryFromValues} from '../query'
import {NominatimBbox} from '../nominatim'
import {makeElement, makeLink, makeDiv, makeLabel} from '../html'

const em=(...ss: Array<string|HTMLElement>)=>makeElement('em')()(...ss)
const code=(...ss: Array<string|HTMLElement>)=>makeElement('code')()(...ss)
const rq=(param: string)=>makeElement('span')('advanced-hint')(` (`,code(param),` parameter)`)
const spanRequest=(...ss: Array<string|HTMLElement>)=>makeElement('span')('advanced-hint')(...ss)

export class NoteBboxFetchDialog extends NoteQueryFetchDialog {
	shortTitle=`BBox`
	title=`Get notes inside rectangular area`
	private nominatimSubForm: NominatimSubForm|undefined
	private $trackMapSelect=document.createElement('select')
	private $trackMapZoomNotice=makeElement('span')('notice')()
	protected $bboxInput=document.createElement('input')
	private mapBoundsForFreezeRestore: L.LatLngBounds|undefined
	constructor(
		$sharedCheckboxes: NoteFetchDialogSharedCheckboxes,
		server: Server,
		getRequestApiPaths: (query: NoteQuery, limit: number) => [type: string, apiPath: string][],
		submitQuery: (query: NoteQuery) => void,
		private map: NoteMap
	) {
		super($sharedCheckboxes,server,getRequestApiPaths,submitQuery)
		if (server.nominatim) {
			this.nominatimSubForm=new NominatimSubForm(
				server.nominatim,
				()=>map.bounds,
				(bbox:NominatimBbox)=>{
					const [minLat,maxLat,minLon,maxLon]=bbox
					this.setBbox(minLon,minLat,maxLon,maxLat)
					this.$trackMapSelect.value='nothing'
					this.map.fitBounds([[Number(minLat),Number(minLon)],[Number(maxLat),Number(maxLon)]])
				}
			)
		}
	}
	resetFetch() {
		this.mapBoundsForFreezeRestore=undefined
	}
	get getAutoLoad(): ()=>boolean {
		return ()=>false
	}
	populateInputs(query: NoteQuery|undefined): void {
		super.populateInputs(query)
		this.nominatimSubForm?.updateRequest()
	}
	protected writeExtraForms() {
		if (this.nominatimSubForm) {
			this.$section.append(this.nominatimSubForm.$form)
		}
	}
	protected makeLeadAdvancedHint(): Array<string|HTMLElement> {
		return [
			`Get `,makeLink(`notes by bounding box`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_notes_data_by_bounding_box:_GET_/api/0.6/notes`),
			` request at `,code(this.server.getApiUrl(`notes?`),em(`parameters`)),`; see `,em(`parameters`),` below.`
		]
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
			this.$trackMapSelect.append(
				new Option(`Do nothing`,'nothing'),
				new Option(`Update bounding box input`,'bbox',true,true),
				new Option(`Fetch notes`,'fetch'),
			)
			$fieldset.append(makeDiv()(
				makeLabel('inline')(this.$trackMapSelect,` on map view changes`),` `,
				this.$trackMapZoomNotice
			))
		}{
			this.$bboxInput.type='text'
			this.$bboxInput.name='bbox'
			this.$bboxInput.required=true // otherwise could submit empty bbox without entering anything
			$fieldset.append(makeDiv('major-input')(makeLabel()(
				`Bounding box (`,
				tip(`left`,`western-most (min) longitude`),`, `,
				tip(`bottom`,`southern-most (min) latitude`),`, `,
				tip(`right`,`eastern-most (max) longitude`),`, `,
				tip(`top`,`northern-most (max) latitude`),
				`)`,rq('bbox'),spanRequest(` (also `,code('west'),`, `,code('south'),`, `,code('east'),`, `,code('north'),` Nominatim parameters)`),`: `,
				this.$bboxInput
			)))
			function tip(text: string, title: string) {
				const $span=document.createElement('span')
				$span.textContent=text
				$span.title=title
				return $span
			}
		}
		if (this.nominatimSubForm) {
			this.nominatimSubForm.write($fieldset)
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
			if (this.$trackMapSelect.value!='fetch') {
				this.$trackMapZoomNotice.classList.remove('error')
				this.$trackMapZoomNotice.innerText=''
			} else {
				if (this.map.zoom>=8) {
					this.$trackMapZoomNotice.classList.remove('error')
					this.$trackMapZoomNotice.innerText=`(fetching will stop on zooms lower than 8)`
				} else {
					this.$trackMapZoomNotice.classList.add('error')
					this.$trackMapZoomNotice.innerText=`(fetching will start on zooms 8 or higher)`
				}
			}
		}
		const trackMap=()=>{
			updateTrackMapZoomNotice()
			if (this.$trackMapSelect.value=='bbox' || this.$trackMapSelect.value=='fetch') {
				const bounds=this.map.bounds
				this.setBbox(bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth())
			}
			this.nominatimSubForm?.updateRequest()
		}
		const updateNotesIfNeeded=()=>{
			if (this.isOpen() && this.$trackMapSelect.value=='fetch' && this.map.zoom>=8) {
				this.$form.requestSubmit()
			}
		}
		updateTrackMapZoomNotice()
		this.map.onMoveEnd(()=>{
			trackMap()
			if (this.isOpen() && this.mapBoundsForFreezeRestore) {
				this.mapBoundsForFreezeRestore=undefined
			} else {
				updateNotesIfNeeded()
			}
		})
		this.$trackMapSelect.addEventListener('input',()=>{
			this.map.freezeMode=this.getMapFreezeMode() // don't update freeze mode on map moves
			trackMap()
			updateNotesIfNeeded()
		})
		this.$bboxInput.addEventListener('input',()=>{
			if (!this.validateBbox()) return
			this.$trackMapSelect.value='nothing'
		})
		if (this.nominatimSubForm) {
			this.nominatimSubForm.addEventListeners()
		}
	}
	protected constructQuery(): NoteQuery | undefined {
		return makeNoteBboxQueryFromValues(
			this.$bboxInput.value,this.closedValue
		)
	}
	protected listQueryChangingInputs(): Array<HTMLInputElement|HTMLSelectElement> {
		return [
			this.$bboxInput,this.$closedInput,this.$closedSelect
		]
	}
	onOpen(): void {
		if (this.getMapFreezeMode()=='full' && this.mapBoundsForFreezeRestore) {
			this.map.fitBounds(this.mapBoundsForFreezeRestore) // assumes map is not yet frozen
			// this.restoreMapBoundsForFreeze=undefined to be done in map move end listener
		} else {
			this.mapBoundsForFreezeRestore=undefined
		}
		this.map.freezeMode=this.getMapFreezeMode()
	}
	onClose(): void {
		if (this.getMapFreezeMode()=='full') {
			this.mapBoundsForFreezeRestore=this.map.bounds
		}
		this.map.freezeMode='no'
	}
	private getMapFreezeMode(): NoteMapFreezeMode {
		if (this.$trackMapSelect.value=='fetch') return 'full'
		if (this.$trackMapSelect.value=='bbox') return 'initial'
		return 'no'
	}
	private setBbox(west:number|string,south:number|string,east:number|string,north:number|string): void {
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
}
