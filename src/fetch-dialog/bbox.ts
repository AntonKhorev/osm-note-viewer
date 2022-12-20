import {NoteQueryFetchDialog, NoteFetchDialogSharedCheckboxes} from './base'
import {NoteMap, NoteMapFreezeMode} from '../map'
import {NoteQuery, makeNoteBboxQueryFromValues} from '../query'
import {NominatimBbox, NominatimBboxFetcher} from '../nominatim'
import {makeElement, makeLink, makeDiv, makeLabel} from '../html'

const em=(...ss: Array<string|HTMLElement>)=>makeElement('em')()(...ss)
const code=(...ss: Array<string|HTMLElement>)=>makeElement('code')()(...ss)
const rq=(param: string)=>makeElement('span')('advanced-hint')(` (`,code(param),` parameter)`)
const spanRequest=(...ss: Array<string|HTMLElement>)=>makeElement('span')('advanced-hint')(...ss)

export class NoteBboxFetchDialog extends NoteQueryFetchDialog {
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
	private $trackMapSelect=document.createElement('select')
	private $trackMapZoomNotice=makeElement('span')('notice')()
	protected $bboxInput=document.createElement('input')
	private $nominatimRequestOutput=document.createElement('output')
	private mapBoundsForFreezeRestore: L.LatLngBounds|undefined
	constructor(
		$sharedCheckboxes: NoteFetchDialogSharedCheckboxes,
		getRequestUrls: (query: NoteQuery, limit: number) => [type: string, url: string][],
		submitQuery: (query: NoteQuery) => void,
		private map: NoteMap
	) {
		super($sharedCheckboxes,getRequestUrls,submitQuery)
	}
	resetFetch() {
		this.mapBoundsForFreezeRestore=undefined
	}
	get getAutoLoad(): ()=>boolean {
		return ()=>false
	}
	populateInputs(query: NoteQuery|undefined): void {
		super.populateInputs(query)
		this.updateNominatimRequest()
	}
	protected writeExtraForms() {
		this.$nominatimForm.id='nominatim-form'
		this.$section.append(this.$nominatimForm)
	}
	protected makeLeadAdvancedHint(): Array<string|HTMLElement> {
		return [
			`Get `,makeLink(`notes by bounding box`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_notes_data_by_bounding_box:_GET_/api/0.6/notes`),
			` request at `,code(`https://api.openstreetmap.org/api/0.6/notes?`,em(`parameters`)),`; see `,em(`parameters`),` below.`
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
		}{
			$fieldset.append(makeDiv('advanced-hint')(
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
			$fieldset.append(makeDiv('advanced-hint')(`Resulting Nominatim request: `,this.$nominatimRequestOutput))
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
		const validateBounds=():boolean=>{
			const splitValue=this.$bboxInput.value.split(',')
			if (splitValue.length!=4) {
				this.$bboxInput.setCustomValidity(`must contain four comma-separated values`)
				return false
			}
			this.$bboxInput.setCustomValidity('')
			return true
		}
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
				// (left,bottom,right,top)
				this.$bboxInput.value=bounds.getWest()+','+bounds.getSouth()+','+bounds.getEast()+','+bounds.getNorth()
				validateBounds()
				this.updateRequest()
				this.updateNominatimRequest()
			}
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
			if (!validateBounds()) return
			this.$trackMapSelect.value='nothing'
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
				this.$trackMapSelect.value='nothing'
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
	private updateNominatimRequest(): void {
		const bounds=this.map.bounds
		const url=this.nominatimBboxFetcher.getUrl(
			this.$nominatimInput.value,
			bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()
		)
		const $a=makeLink(url,url)
		$a.classList.add('request')
		this.$nominatimRequestOutput.replaceChildren(code($a))
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
