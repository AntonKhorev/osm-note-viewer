import {NoteFetchDialog, mixinWithFetchButton} from './base'
import {NoteMap} from '../map'
import {NoteQuery, makeNoteBboxQueryFromValues} from '../query'
import {NominatimBbox, NominatimBboxFetcher} from '../nominatim'
import {makeElement, makeLink, makeDiv, makeLabel} from '../util'

const em=(...ss: Array<string|HTMLElement>)=>makeElement('em')()(...ss)
const code=(...ss: Array<string|HTMLElement>)=>makeElement('code')()(...ss)
const rq=(param: string)=>makeElement('span')('request')(` (`,code(param),` parameter)`)
const spanRequest=(...ss: Array<string|HTMLElement>)=>makeElement('span')('request')(...ss)

export class NoteBboxFetchDialog extends mixinWithFetchButton(NoteFetchDialog) {
	shortTitle=`BBox`
	title=`Get notes inside rectangular area`
	private $nominatimForm=document.createElement('form')
	private $nominatimInput=document.createElement('input')
	private $nominatimButton=document.createElement('button')
	private nominatimBboxFetcher=new NominatimBboxFetcher(
		async(url)=>{
			const response=await fetch(url)
			if (!response.ok) {
				throw new TypeError('Nominatim error: unsuccessful response')
			}
			return response.json()
		},
		...makeDumbCache() // TODO real cache in db
	)
	protected $bboxInput=document.createElement('input')
	protected $trackMapCheckbox=document.createElement('input')
	protected $statusSelect=document.createElement('select')
	private $nominatimRequestOutput=document.createElement('output')
	constructor(
		getRequestUrls: (query: NoteQuery, limit: number) => [type: string, url: string][],
		submitQuery: (query: NoteQuery) => void,
		private map: NoteMap
	) {
		super(getRequestUrls,submitQuery)
	}
	getAutoLoadChecker(): {checked: boolean} {
		return {checked: false}
	}
	populateInputs(query: NoteQuery|undefined): void {
		super.populateInputs(query)
		this.updateNominatimRequest()
	}
	needToSuppressFitNotes(): boolean {
		return this.$trackMapCheckbox.checked
	}
	protected writeExtraForms() {
		this.$nominatimForm.id='nominatim-form'
		this.$section.append(this.$nominatimForm)
	}
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void {
		{
			$fieldset.append(makeDiv('request')(
				`Get `,makeLink(`notes by bounding box`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_notes_data_by_bounding_box:_GET_/api/0.6/notes`),
				` request at `,code(`https://api.openstreetmap.org/api/0.6/notes?`,em(`parameters`)),`; see `,em(`parameters`),` below.`
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
		}{
			this.$trackMapCheckbox.type='checkbox'
			this.$trackMapCheckbox.checked=true
			$fieldset.append(makeDiv()(makeLabel()(
				this.$trackMapCheckbox,` Update bounding box value with current map area`
			)))
		}{
			$fieldset.append(makeDiv('request')(
				`Make `,makeLink(`Nominatim search query`,`https://nominatim.org/release-docs/develop/api/Search/`),
				` at `,code(this.nominatimBboxFetcher.urlBase+'?',em(`parameters`)),`; see `,em(`parameters`),` above and below.`
			))
			this.$nominatimInput.type='text'
			this.$nominatimInput.required=true
			this.$nominatimInput.classList.add('no-invalid-indication') // because it's inside another form that doesn't require it, don't indicate that it's invalid
			this.$nominatimInput.name='place'
			this.$nominatimInput.setAttribute('form','nominatim-form')
			this.$nominatimButton.textContent='Get'
			this.$nominatimButton.setAttribute('form','nominatim-form')
			$fieldset.append(makeDiv('text-button-input')(makeLabel()(
				`Or get bounding box by place name from Nominatim`,spanRequest(` (`,code('q'),` Nominatim parameter)`),`: `,
				this.$nominatimInput
			),this.$nominatimButton))
			$fieldset.append(makeDiv('request')(`Resulting Nominatim request: `,this.$nominatimRequestOutput))
		}{
			this.$statusSelect.append(
				new Option(`both open and closed`,'-1'),
				new Option(`open and recently closed`,'7'),
				new Option(`only open`,'0'),
			)
			$fieldset.append(makeDiv()(
				`Fetch `,
				makeLabel('inline')(this.$statusSelect,rq('closed'),` matching notes`),` `,
				`sorted by last update date `,
				`newest first`
			))
		}
	}
	protected writeDownloadModeFieldset($fieldset: HTMLFieldSetElement): void {
		{
			this.$limitSelect.append(
				new Option('20'),
				new Option('100'),
				new Option('500'),
				new Option('2500'),
				new Option('10000')
			)
			$fieldset.append(makeDiv()(
				`Download `,
				makeLabel()(`at most `,this.$limitSelect,rq('limit'),` notes`)
			))
		}
	}
	protected populateInputsWithoutUpdatingRequest(query: NoteQuery | undefined): void {
		if (query && query.mode!='bbox') return
		this.$bboxInput.value=query?.bbox ?? ''
		this.$statusSelect.value=query ? String(query.closed) : '-1'
	}
	protected addEventListeners(): void {
		const validateBounds=():boolean=>{
			const splitValue=this.$bboxInput.value.split(',')
			if (splitValue.length!=4) {
				this.$bboxInput.setCustomValidity(`must contain four comma-separated values`)
				return false
			}
			this.$bboxInput.setCustomValidity('')
			return true
		}
		const copyBounds=()=>{
			if (!this.$trackMapCheckbox.checked) return
			const bounds=this.map.bounds
			// (left,bottom,right,top)
			this.$bboxInput.value=bounds.getWest()+','+bounds.getSouth()+','+bounds.getEast()+','+bounds.getNorth()
			validateBounds()
			this.updateRequest()
			this.updateNominatimRequest()
		}
		this.map.onMoveEnd(copyBounds)
		this.$trackMapCheckbox.addEventListener('input',copyBounds)
		this.$bboxInput.addEventListener('input',()=>{
			if (!validateBounds()) return
			this.$trackMapCheckbox.checked=false
		})
		this.$bboxInput.addEventListener('input',()=>this.updateNominatimRequest())
		this.$nominatimInput.addEventListener('input',()=>this.updateNominatimRequest())
		this.$nominatimForm.addEventListener('submit',async(ev)=>{
			ev.preventDefault()
			this.$nominatimButton.disabled=true
			this.$nominatimButton.classList.remove('error')
			try {
				const bounds=this.map.bounds
				const bbox=await this.nominatimBboxFetcher.fetch(
					Date.now(),
					this.$nominatimInput.value,
					bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()
				)
				const [minLat,maxLat,minLon,maxLon]=bbox
				this.$bboxInput.value=`${minLon},${minLat},${maxLon},${maxLat}`
				validateBounds()
				this.updateRequest()
				this.updateNominatimRequest()
				this.$trackMapCheckbox.checked=false
				this.map.fitBounds([[Number(minLat),Number(minLon)],[Number(maxLat),Number(maxLon)]])
			} catch (ex) {
				this.$nominatimButton.classList.add('error')
				if (ex instanceof TypeError) {
					this.$nominatimButton.title=ex.message
				} else {
					this.$nominatimButton.title=`unknown error ${ex}`
				}
			} finally {
				this.$nominatimButton.disabled=false
			}
		})
	}
	protected constructQuery(): NoteQuery | undefined {
		return makeNoteBboxQueryFromValues(
			this.$bboxInput.value,this.$statusSelect.value
		)
	}
	protected listQueryChangingInputs(): Array<HTMLInputElement|HTMLSelectElement> {
		return [
			this.$bboxInput,this.$statusSelect
		]
	}
	private updateNominatimRequest() {
		const bounds=this.map.bounds
		const url=this.nominatimBboxFetcher.getUrl(
			this.$nominatimInput.value,
			bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()
		)
		this.$nominatimRequestOutput.replaceChildren(code(makeLink(url,url)))
	}
}

function makeDumbCache(): [
	fetchFromCache: (timestamp:number,url:string)=>Promise<any>,
	storeToCache: (timestamp:number,url:string,bbox:NominatimBbox)=>Promise<any>
] {
	const cache: Map<string,NominatimBbox> = new Map()
	return [
		async(timestamp,url)=>cache.get(url),
		async(timestamp,url,bbox)=>cache.set(url,bbox)
	]
}
