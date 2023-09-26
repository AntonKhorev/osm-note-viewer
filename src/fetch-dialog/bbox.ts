import type {NoteFetchDialogSharedCheckboxes} from './base'
import {NoteQueryFetchDialog} from './base'
import NominatimSubForm from './bbox-nominatim'
import type {Connection} from '../net'
import type NoteMap from '../map'
import type {NoteQuery} from '../query'
import {makeNoteBboxQueryFromValues} from '../query'
import type {NominatimBbox} from '../nominatim'
import makeTextButtonInputGroup from '../text-button-input-group'
import {makeSvgElement} from '../svg'
import {makeElement, makeLink, makeLabel} from '../util/html'
import {p,em,code} from '../util/html-shortcuts'

const rq=(param: string)=>makeElement('span')('advanced-hint')(` (`,code(param),` parameter)`)
const spanRequest=(...ss: Array<string|HTMLElement>)=>makeElement('span')('advanced-hint')(...ss)

export class NoteBboxFetchDialog extends NoteQueryFetchDialog {
	shortTitle=`BBox`
	title=`Get notes inside rectangular area`
	private nominatimSubForm: NominatimSubForm|undefined
	private $linkCheckbox=makeElement('input')()()
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
		if (cx.server.nominatim) {
			this.nominatimSubForm=new NominatimSubForm(
				cx.server.nominatim,
				()=>map.bounds,
				(bbox:NominatimBbox)=>{
					const [minLat,maxLat,minLon,maxLon]=bbox
					this.setBbox(minLon,minLat,maxLon,maxLat)
					this.$linkCheckbox.checked=false
					this.map.fitBounds([[Number(minLat),Number(minLon)],[Number(maxLat),Number(maxLon)]])
				}
			)
		}
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
		return [p(
			`Make a `,makeLink(`notes in bounding box`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_notes_data_by_bounding_box:_GET_/api/0.6/notes`),
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
		this.$linkCheckbox.type='checkbox'
		this.$linkCheckbox.checked=true
		this.$bboxInput.type='text'
		this.$bboxInput.name='bbox'
		this.$bboxInput.required=true // otherwise could submit empty bbox without entering anything
		const labelItems: (string|HTMLElement)[] = [
			`Bounding box (`,
			tip(`left`,`western-most (min) longitude`),`, `,
			tip(`bottom`,`southern-most (min) latitude`),`, `,
			tip(`right`,`eastern-most (max) longitude`),`, `,
			tip(`top`,`northern-most (max) latitude`),
			`)`,rq('bbox')
		]
		if (this.nominatimSubForm) {
			labelItems.push(
				spanRequest(` (also `,code('west'),`, `,code('south'),`, `,code('east'),`, `,code('north'),` Nominatim parameters)`)
			)
		}
		const $linkLabel=makeLabel('link-checkbox-holder')(this.$linkCheckbox)
		$linkLabel.title=`Update bounding box on map view changes`
		const $leftLink=makeSvgElement('svg',{class:'link-left',width:'12',height:'12'})
		$leftLink.innerHTML=`<use href="#chain-link-left" />`
		$linkLabel.prepend($leftLink)
		const $rightLink=makeSvgElement('svg',{class:'link-right',width:'12',height:'12'})
		$rightLink.innerHTML=`<use href="#chain-link-left" />`
		$linkLabel.append($rightLink)
		const $mapLink=makeSvgElement('svg',{class:'link-map',width:'19',height:'13'})
		$mapLink.innerHTML=`<use href="#tools-map" />`
		$linkLabel.append($mapLink)
		$fieldset.append(makeTextButtonInputGroup()(labelItems,this.$bboxInput,$linkLabel))
		function tip(text: string, title: string) {
			const $span=document.createElement('span')
			$span.textContent=text
			$span.title=title
			$span.classList.add('tipped')
			return $span
		}
		if (this.nominatimSubForm) {
			this.nominatimSubForm.write($fieldset)
		}
	}
	protected modifyClosedLine($div: HTMLElement): void {
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
		const trackMap=()=>{
			if (this.$linkCheckbox.checked) {
				this.setBbox(...this.map.precisionBounds.wsen)
			}
			this.nominatimSubForm?.updateRequest()
		}
		this.$root.addEventListener('osmNoteViewer:mapMoveEnd',()=>{
			trackMap()
		})
		this.$linkCheckbox.addEventListener('input',()=>{
			trackMap()
		})
		this.$bboxInput.addEventListener('input',()=>{
			if (!this.validateBbox()) return
			this.$linkCheckbox.checked=false
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
		if (query.mode!='bbox') return []
		return [
			[`bounding box `,this.makeInputLink(this.$bboxInput,query.bbox)]
		]
	}
}
