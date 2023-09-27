import type {NoteFetchDialogSharedCheckboxes} from './base'
import NoteFetchDialog from './base'
import type {NoteQuery} from '../query'
import type {Connection} from '../net'
import type NoteMap from '../map'
import NominatimSubForm from './bbox-nominatim'
import type {NominatimBbox} from '../nominatim'
import makeTextButtonInputGroup from '../text-button-input-group'
import {makeSvgElement} from '../svg'
import {makeElement, makeDiv, makeLabel, makeLink} from '../util/html'
import {em,strong,code} from '../util/html-shortcuts'

const maxBboxArea=25

const rq=(param: string)=>makeElement('span')('advanced-hint')(` (`,code(param),` parameter)`)
const spanRequest=(...ss: Array<string|HTMLElement>)=>makeElement('span')('advanced-hint')(...ss)

export type ParameterListItem = [parameter: string, $input: HTMLElement, descriptionItems: Array<string|HTMLElement>]
export type QueryCaptionItem = (string|HTMLElement)[]

export default abstract class DynamicNoteFetchDialog extends NoteFetchDialog {
	protected withBboxRequiredWhenPresent=false
	private nominatimSubForm: NominatimSubForm|undefined
	protected $bboxInput: HTMLInputElement|undefined
	private $linkCheckbox: HTMLInputElement|undefined
	protected $closedInput=document.createElement('input')
	protected $closedSelect=document.createElement('select')
	constructor(
		$root: HTMLElement,
		$sharedCheckboxes: NoteFetchDialogSharedCheckboxes,
		cx: Connection,
		getRequestApiPaths: (query: NoteQuery, limit: number) => [type: string, apiPath: string][],
		submitQuery: (query: NoteQuery, isTriggeredBySubmitButton: boolean) => void,
		protected map: NoteMap
	) {
		super($root,$sharedCheckboxes,cx,getRequestApiPaths,submitQuery)
	}
	protected get withBbox(): boolean {
		return false
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
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void {
		if (this.withBbox) {
			this.$bboxInput=document.createElement('input')
			this.$bboxInput.type='text'
			this.$bboxInput.name='bbox'
			this.$bboxInput.required=this.withBboxRequiredWhenPresent
			this.$linkCheckbox=document.createElement('input')
			this.$linkCheckbox.type='checkbox'
			this.$linkCheckbox.checked=this.withBboxRequiredWhenPresent
		}
		if (this.withBbox && this.cx.server.nominatim) {
			this.nominatimSubForm=new NominatimSubForm(
				this.cx.server.nominatim,
				()=>this.map.bounds,
				(bbox:NominatimBbox)=>{
					const [minLat,maxLat,minLon,maxLon]=bbox
					this.setBbox(minLon,minLat,maxLon,maxLat)
					if (this.$linkCheckbox) this.$linkCheckbox.checked=false
					this.map.fitBounds([[Number(minLat),Number(minLon)],[Number(maxLat),Number(maxLon)]])
				}
			)
		}
		$fieldset.append(makeDiv('advanced-hint')(
			...this.makeLeadAdvancedHint()
		))
		this.writeScopeAndOrderFieldsetQueryParameterHints($fieldset)
		this.writeScopeAndOrderFieldsetBetweenParametersAndBbox($fieldset)
		if (this.$bboxInput && this.$linkCheckbox) {
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
				const $details=makeElement('details')()(
					makeElement('summary')()(`or get bounding box by place name from Nominatim`)
				)
				this.nominatimSubForm.write($details)
				$fieldset.append($details)
			}
		}
		this.writeScopeAndOrderFieldsetBetweenBboxAndClosed($fieldset)
		{
			this.$closedInput.type='number'
			this.$closedInput.min='-1'
			this.$closedSelect.append(
				new Option(`both open and closed`,'-1'),
				new Option(`open and recently closed`,'7'),
				new Option(`only open`,'0'),
			)
			this.$closedInput.value=this.$closedSelect.value=this.defaultClosedValue
			const $closedLine=makeDiv('regular-input-group')(
				`Fetch `,
				makeElement('span')('non-advanced-input-group')(
					this.$closedSelect
				),
				` `,this.getClosedLineNotesText(),` `,
				makeLabel('advanced-input-group')(
					`closed no more than `,
					this.$closedInput,
					makeElement('span')('advanced-hint')(` (`,code('closed'),` parameter)`),
					` days ago`
				)
			)
			this.modifyClosedLine($closedLine)
			$fieldset.append($closedLine)
		}
	}
	private writeScopeAndOrderFieldsetQueryParameterHints($fieldset: HTMLFieldSetElement): void {
		const makeTr=(cellType: 'th'|'td')=>(...sss: Array<Array<string|HTMLElement>>)=>makeElement('tr')()(...sss.map(ss=>makeElement(cellType)()(...ss)))
		const extraQueryParameters: ParameterListItem[] =[]
		if (this.$bboxInput) {
			extraQueryParameters.push(['bbox',this.$bboxInput,[
				`Bounding box. `,
				`Expect `,em(`The maximum bbox size is ..., and your request was too large`),` error if the bounding box is too large. `,
				`Maximum allowed bbox area in square degrees can be found in the `,em(`note_area`),` value of `,makeLink(`API capabilities`,this.cx.server.api.getUrl(`capabilities`)),`. `,
				`Currently all major `,em(`openstreetmap-website`),` deployments have it set to `,strong(String(maxBboxArea)),`, this is what `,em(`note-viewer`),` assumes.`
			]])
		}
		const closedParameter: ParameterListItem = ['closed',this.$closedInput,[
			`Max number of days for closed note to be visible. `,
			`In `,em(`advanced mode`),` can be entered as a numeric value. `,
			`When `,em(`advanced mode`),` is disabled this parameter is available as a dropdown menu with the following values: `,
			makeElement('table')()(
				makeTr('th')([`label`],[`value`],[`description`]),
				makeTr('td')([em(`both open and closed`)],[code(`-1`)],[
					`Special value to ignore how long ago notes were closed. `,
					`This is the default value for `,em(`note-viewer`),` because it's the most useful one in conjunction with searching for a given user's notes.`
				]),
				makeTr('td')([em(`open and recently closed`)],[code(`7`)],[
					`The most common value used in other apps like the OSM website.`
				]),
				makeTr('td')([em(`only open`)],[code(`0`)],[
					`Ignore closed notes.`
				])
			)
		]]
		const parameters=this.listParameters(extraQueryParameters,closedParameter)
		if (parameters.length==0) return
		const $table=document.createElement('table')
		{
			const $row=$table.insertRow()
			$row.append(
				makeElement('th')()(`parameter`),
				makeElement('th')()(`description`)
			)
		}
		for (const [parameter,$input,descriptionItems] of parameters) {
			const $row=$table.insertRow()
			const $parameter=makeElement('code')('linked-parameter')(parameter) // TODO <a> or other focusable element
			$parameter.onclick=()=>$input.focus()
			$row.insertCell().append($parameter)
			$row.insertCell().append(...descriptionItems)
		}
		$fieldset.append(makeDiv('advanced-hint')(
			makeElement('details')()(
				makeElement('summary')()(`Supported parameters`),
				$table
			)
		))
	}
	protected abstract makeLeadAdvancedHint(): Array<string|HTMLElement>
	protected listParameters(extraQueryParameters: ParameterListItem[], closedParameter: ParameterListItem): ParameterListItem[] { return [] }
	protected writeScopeAndOrderFieldsetBetweenParametersAndBbox($fieldset: HTMLFieldSetElement): void {}
	protected writeScopeAndOrderFieldsetBetweenBboxAndClosed($fieldset: HTMLFieldSetElement): void {}
	protected getClosedLineNotesText(): string {
		return `notes`
	}
	protected modifyClosedLine($div: HTMLElement): void {}
	protected addEventListeners(): void {
		this.addEventListenersBeforeClosedLine()
		if (this.$bboxInput && this.$linkCheckbox) {
			const trackMap=()=>{
				if (this.$linkCheckbox?.checked) {
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
				if (this.$linkCheckbox) this.$linkCheckbox.checked=false
			})
			if (this.nominatimSubForm) {
				this.nominatimSubForm.addEventListeners()
			}
		}
		this.$closedSelect.addEventListener('input',()=>{
			this.$closedInput.value=this.$closedSelect.value
			this.onClosedValueChange()
		})
		this.$closedInput.addEventListener('input',()=>{
			this.$closedSelect.value=String(restrictClosedSelectValue(Number(this.$closedInput.value)))
			this.onClosedValueChange()
		})
	}
	protected addEventListenersBeforeClosedLine(): void {}
	protected onClosedValueChange(): void {}
	protected populateInputsWithoutUpdatingRequest(query: NoteQuery|undefined): void {
		this.populateInputsWithoutUpdatingRequestExceptForClosedInput(query)
		if (query && (query.mode=='search' || query.mode=='bbox' || query.mode=='browse')) {
			this.$closedInput.value=String(query.closed)
			this.$closedSelect.value=String(restrictClosedSelectValue(query.closed))
			if (this.$bboxInput) this.$bboxInput.value=query?.bbox ?? ''
		} else {
			this.$closedInput.value=this.$closedSelect.value=this.defaultClosedValue
		}
	}
	protected get defaultClosedValue(): string {
		return '-1'
	}
	protected populateInputsWithoutUpdatingRequestExceptForClosedInput(query: NoteQuery|undefined): void {}
	protected get closedValue(): string {
		return (this.$advancedModeCheckbox.checked
			? this.$closedInput.value
			: this.$closedSelect.value
		)
	}
	getQueryCaption(query: NoteQuery): HTMLTableCaptionElement {
		if (query.mode!='search' && query.mode!='bbox' && query.mode!='browse') return super.getQueryCaption(query)
		const extraQueryCaptionItems: QueryCaptionItem[] = []
		if (this.$bboxInput && query.bbox!=null) {
			extraQueryCaptionItems.push(
				[`bounding box `,this.makeInputLink(this.$bboxInput,query.bbox)]
			)
		}
		const items=this.getQueryCaptionItems(query,extraQueryCaptionItems)
		const $caption=makeElement('caption')()()
		if (query.closed==0) {
			$caption.append(`open notes`)
		} else if (query.closed==7) {
			$caption.append(`open and recently closed notes`)
		} else if (query.closed>0) {
			$caption.append(`open notes and notes closed up to ${query.closed} days ago`)
		} else {
			$caption.append(`notes`)
		}
		if (items.length>0) {
			$caption.append(` for `)
			let first=true
			for (const item of items) {
				if (first) {
					first=false
				} else {
					$caption.append(`, `)
				}
				$caption.append(...item)
			}
		}
		return $caption
	}
	protected listQueryChangingInputs(): Array<HTMLInputElement|HTMLSelectElement> {
		const $inputs=this.listQueryChangingInputsWithoutBbox()
		if (this.$bboxInput) $inputs.push(this.$bboxInput)
		return $inputs
	}
	protected abstract listQueryChangingInputsWithoutBbox(): Array<HTMLInputElement|HTMLSelectElement>
	protected abstract getQueryCaptionItems(query: NoteQuery, extraQueryCaptionItems: QueryCaptionItem[]): QueryCaptionItem[]
	private setBbox(west:string,south:string,east:string,north:string): void {
		if (!this.$bboxInput) return
		// (left,bottom,right,top)
		this.$bboxInput.value=west+','+south+','+east+','+north
		this.validateBbox()
		this.updateRequest()
	}
	private validateBbox(): boolean {
		if (!this.$bboxInput) return true
		const value=this.$bboxInput.value.trim()
		if (!this.withBboxRequiredWhenPresent && value=='') return true
		const lead=this.withBboxRequiredWhenPresent?``:`if provided, `
		const splitValue=value.split(',')
		if (splitValue.length!=4) {
			this.$bboxInput.setCustomValidity(lead+`must contain four comma-separated values`)
			return false
		}
		for (const number of splitValue) {
			if (!isFinite(Number(number))) {
				this.$bboxInput.setCustomValidity(lead+`values must be numbers, "${number}" is not a number`)
				return false
			}
		}
		const [west,south,east,north]=splitValue.map(Number)
		const area=(east-west)*(north-south)
		if (area>maxBboxArea) {
			this.$bboxInput.setCustomValidity(lead+`area must not be greater than ${maxBboxArea} square degrees, currently it's ${Math.round(area)}`)
			return false
		}
		this.$bboxInput.setCustomValidity('')
		return true
	}
}

function restrictClosedSelectValue(v: number): number {
	if (v<0) {
		return -1
	} else if (v<1) {
		return 0
	} else {
		return 7
	}
}
