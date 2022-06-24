import {NoteMap} from './map'
import {NoteQuery, makeNoteSearchQueryFromValues, makeNoteBboxQueryFromValues} from './query'
import {toUserQuery} from './query-user'
import {toDateQuery, toReadableDate} from './query-date'
import {NominatimBbox, NominatimBboxFetcher} from './nominatim'
import {makeElement, makeLink, makeDiv, makeLabel} from './util'

const em=(...ss: Array<string|HTMLElement>)=>makeElement('em')()(...ss)
const sup=(...ss: Array<string|HTMLElement>)=>makeElement('sup')()(...ss)
const code=(...ss: Array<string|HTMLElement>)=>makeElement('code')()(...ss)
const rq=(param: string)=>makeElement('span')('request')(` (`,code(param),` parameter)`)
const rq2=(param1: string, param2: string)=>makeElement('span')('request')(` (`,code(param1),` or `,code(param2),` parameter)`)
const spanRequest=(...ss: Array<string|HTMLElement>)=>makeElement('span')('request')(...ss)

export interface NoteFetchDialogSharedCheckboxes {
	showImages: HTMLInputElement[]
	showRequests: HTMLInputElement[]
}

abstract class NoteFetchDialog {
	abstract title: string
	protected $details=document.createElement('details')
	$fetchButton=document.createElement('button')
	$limitSelect=document.createElement('select')
	private $requestOutput=document.createElement('output')
	constructor(
		private getRequestUrls: (query: NoteQuery, limit: number) => [type: string, url: string][],
		private submitQuery: (query: NoteQuery) => void
	) {}
	write($container: HTMLElement, $sharedCheckboxes: NoteFetchDialogSharedCheckboxes, initialQuery: NoteQuery|undefined) {
		const $summary=document.createElement('summary')
		$summary.textContent=this.title
		const $form=document.createElement('form')
		const $scopeFieldset=this.makeScopeAndOrderFieldset()
		const $downloadFieldset=this.makeDownloadModeFieldset($sharedCheckboxes)
		$form.append(
			$scopeFieldset,
			$downloadFieldset,
			this.makeFetchButtonDiv(),
			this.makeRequestDiv()
		)
		this.populateInputs(initialQuery)
		this.addEventListeners()
		this.addRequestChangeListeners()
		$form.addEventListener('submit',(ev)=>{
			ev.preventDefault()
			const query=this.constructQuery()
			if (!query) return
			this.submitQuery(query)
		})
		this.$details.addEventListener('toggle',()=>{ // keep only one dialog open
			if (!this.$details.open) return
			for (const $otherDetails of $container.querySelectorAll('details')) {
				if ($otherDetails==this.$details) continue
				if (!$otherDetails.open) continue
				$otherDetails.open=false
			}
		})
		this.$details.append($summary,$form)
		this.writeExtraForms()
		$container.append(this.$details)
	}
	open(): void {
		this.$details.open=true
	}
	populateInputs(query: NoteQuery|undefined): void {
		this.populateInputsWithoutUpdatingRequest(query)
		this.updateRequest()
	}
	protected updateRequest() {
		const knownTypes: {[type:string]:string} = {
			json: `https://wiki.openstreetmap.org/wiki/GeoJSON`,
			gpx: `https://www.topografix.com/GPX/1/1/`, // gpx on osm wiki talks mostly about tracks
			rss: `https://www.rssboard.org/rss-specification`, // osm wiki doesn't describe rss format
		}
		const appendLinkIfKnown=(type:string)=>{
			const url=knownTypes[type]
			if (url==null) return
			this.$requestOutput.append(sup(makeLink(`[?]`,url)))
		}
		const query=this.constructQuery()
		if (!query) {
			this.$requestOutput.replaceChildren(`invalid request`)
			return
		}
		const requestUrls=this.getRequestUrls(query,Number(this.$limitSelect.value))
		if (requestUrls.length==0) {
			this.$requestOutput.replaceChildren(`invalid request`)
			return
		}
		const [[mainType,mainUrl],...otherRequestUrls]=requestUrls
		this.$requestOutput.replaceChildren(code(makeLink(mainUrl,mainUrl)),` in ${mainType} format`)
		appendLinkIfKnown(mainType)
		if (otherRequestUrls.length>0) {
			this.$requestOutput.append(` or other formats: `)
		}
		let first=true
		for (const [type,url] of otherRequestUrls) {
			if (first) {
				first=false
			} else {
				this.$requestOutput.append(`, `)
			}
			this.$requestOutput.append(code(makeLink(type,url)))
			appendLinkIfKnown(type)
		}
	}
	private makeScopeAndOrderFieldset(): HTMLFieldSetElement {
		const $fieldset=document.createElement('fieldset')
		const $legend=document.createElement('legend')
		$legend.textContent=`Scope and order`
		$fieldset.append($legend)
		this.writeScopeAndOrderFieldset($fieldset)
		return $fieldset
	}
	private makeDownloadModeFieldset($sharedCheckboxes: NoteFetchDialogSharedCheckboxes): HTMLFieldSetElement {
		const $fieldset=document.createElement('fieldset')
		// TODO (re)store input values
		const $legend=document.createElement('legend')
		$legend.textContent=`Download mode (can change anytime)`
		$fieldset.append($legend)
		this.writeDownloadModeFieldset($fieldset)
		const $showImagesCheckbox=document.createElement('input')
		$showImagesCheckbox.type='checkbox'
		$sharedCheckboxes.showImages.push($showImagesCheckbox)
		$fieldset.append(makeDiv()(makeLabel()(
			$showImagesCheckbox,` Load and show images from StreetComplete`
		)))
		const $showRequestsCheckbox=document.createElement('input')
		$showRequestsCheckbox.type='checkbox'
		$sharedCheckboxes.showRequests.push($showRequestsCheckbox)
		$fieldset.append(makeDiv()(makeLabel()(
			$showRequestsCheckbox,` Show request parameters and URLs`
		)))
		return $fieldset
	}
	private makeFetchButtonDiv(): HTMLDivElement {
		this.$fetchButton.textContent=`Fetch notes`
		this.$fetchButton.type='submit'
		return makeDiv('major-input')(this.$fetchButton)
	}
	private makeRequestDiv() {
		return makeDiv('request')(`Resulting request: `,this.$requestOutput)
	}
	private addRequestChangeListeners() {
		for (const $input of this.listQueryChangingInputs()) {
			$input.addEventListener('input',()=>this.updateRequest())
		}
		this.$limitSelect.addEventListener('input',()=>this.updateRequest())
	}
	protected abstract writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void
	protected abstract writeDownloadModeFieldset($fieldset: HTMLFieldSetElement): void
	protected writeExtraForms(): void {}
	protected abstract populateInputsWithoutUpdatingRequest(query: NoteQuery|undefined): void
	protected abstract addEventListeners(): void
	protected abstract constructQuery(): NoteQuery | undefined
	protected abstract listQueryChangingInputs(): Array<HTMLInputElement|HTMLSelectElement>
}

export class NoteSearchFetchDialog extends NoteFetchDialog {
	title=`Search notes for user / text / date range`
	protected $userInput=document.createElement('input')
	protected $textInput=document.createElement('input')
	protected $fromInput=document.createElement('input')
	protected $toInput=document.createElement('input')
	protected $statusSelect=document.createElement('select')
	protected $sortSelect=document.createElement('select')
	protected $orderSelect=document.createElement('select')
	$autoLoadCheckbox=document.createElement('input')
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void {
		{
			$fieldset.append(makeDiv('request')(
				`Make a `,makeLink(`search for notes`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Search_for_notes:_GET_/api/0.6/notes/search`),
				` request at `,code(`https://api.openstreetmap.org/api/0.6/notes/search?`,em(`parameters`)),`; see `,em(`parameters`),` below.`
			))
		}{
			this.$userInput.type='text'
			this.$userInput.name='user'
			$fieldset.append(makeDiv('major-input')(makeLabel()(
				`OSM username, URL or #id`,rq2('display_name','user'),`: `,this.$userInput
			)))
		}{
			this.$textInput.type='text'
			this.$textInput.name='text'
			$fieldset.append(makeDiv('major-input')(makeLabel()(
				`Comment text search query`,rq('q'),`: `,this.$textInput
			)))
		}{
			this.$fromInput.type='text'
			this.$fromInput.size=20
			this.$fromInput.name='from'
			this.$toInput.type='text'
			this.$toInput.size=20
			this.$toInput.name='to'
			$fieldset.append(makeDiv()(
				`Date range: `,
				makeLabel()(`from`,rq('from'),` `,this.$fromInput),` `,
				makeLabel()(`to`,rq('to'),` `,this.$toInput)
			))
		}{
			this.$statusSelect.append(
				new Option(`both open and closed`,'-1'),
				new Option(`open and recently closed`,'7'),
				new Option(`only open`,'0'),
			)
			this.$sortSelect.append(
				new Option(`creation`,'created_at'),
				new Option(`last update`,'updated_at')
			)
			this.$orderSelect.append(
				new Option('newest'),
				new Option('oldest')
			)
			$fieldset.append(makeDiv()(
				`Fetch `,
				makeLabel('inline')(this.$statusSelect,rq('closed'),` matching notes`),` `,
				makeLabel('inline')(`sorted by `,this.$sortSelect,rq('sort'),` date`),`, `,
				makeLabel('inline')(this.$orderSelect,rq('order'),` first`)
			))
		}
	}
	protected writeDownloadModeFieldset($fieldset: HTMLFieldSetElement): void {
		{
			this.$limitSelect.append(
				new Option('20'),
				new Option('100'),
				new Option('500'),
				new Option('2500')
			)
			$fieldset.append(makeDiv()(
				`Download these `,
				makeLabel()(`in batches of `,this.$limitSelect,rq('limit'),` notes`)
			))
		}{
			this.$autoLoadCheckbox.type='checkbox'
			this.$autoLoadCheckbox.checked=true
			$fieldset.append(makeDiv()(makeLabel()(
				this.$autoLoadCheckbox,` Automatically load more notes when scrolled to the end of the table`
			)))
		}
	}
	protected populateInputsWithoutUpdatingRequest(query: NoteQuery | undefined): void {
		if (query && query.mode!='search') return
		// TODO why populate on empty query?
		if (query?.display_name) {
			this.$userInput.value=query.display_name
		} else if (query?.user) {
			this.$userInput.value='#'+query.user
		} else {
			this.$userInput.value=''
		}
		this.$textInput.value=query?.q ?? ''
		this.$fromInput.value=toReadableDate(query?.from)
		this.$toInput.value=toReadableDate(query?.to)
		this.$statusSelect.value=query ? String(query.closed) : '-1'
		this.$sortSelect.value=query?.sort ?? 'created_at'
		this.$orderSelect.value=query?.order ?? 'newest'
	}
	protected addEventListeners(): void {
		this.$userInput.addEventListener('input',()=>{
			const userQuery=toUserQuery(this.$userInput.value)
			if (userQuery.userType=='invalid') {
				this.$userInput.setCustomValidity(userQuery.message)
			} else {
				this.$userInput.setCustomValidity('')
			}
		})
		for (const $input of [this.$fromInput,this.$toInput]) $input.addEventListener('input',()=>{
			const query=toDateQuery($input.value)
			if (query.dateType=='invalid') {
				$input.setCustomValidity(query.message)
			} else {
				$input.setCustomValidity('')
			}
		})
	}
	protected constructQuery(): NoteQuery | undefined {
		return makeNoteSearchQueryFromValues(
			this.$userInput.value,this.$textInput.value,this.$fromInput.value,this.$toInput.value,
			this.$statusSelect.value,this.$sortSelect.value,this.$orderSelect.value
		)
	}
	protected listQueryChangingInputs(): Array<HTMLInputElement|HTMLSelectElement> {
		return [
			this.$userInput,this.$textInput,this.$fromInput,this.$toInput,
			this.$statusSelect,this.$sortSelect,this.$orderSelect
		]
	}
}

export class NoteBboxFetchDialog extends NoteFetchDialog {
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
	title=`Get notes inside small rectangular area`
	protected $bboxInput=document.createElement('input')
	$trackMapCheckbox=document.createElement('input')
	protected $statusSelect=document.createElement('select')
	private $nominatimRequestOutput=document.createElement('output')
	constructor(
		getRequestUrls: (query: NoteQuery, limit: number) => [type: string, url: string][],
		submitQuery: (query: NoteQuery) => void,
		private map: NoteMap
	) {
		super(getRequestUrls,submitQuery)
	}
	populateInputs(query: NoteQuery|undefined): void {
		super.populateInputs(query)
		this.updateNominatimRequest()
	}
	protected writeExtraForms() {
		this.$details.append(this.$nominatimForm)
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
			this.$nominatimForm.id='nominatim-form'
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
		// TODO why populate on empty query?
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
