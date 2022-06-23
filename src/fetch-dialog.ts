import {NoteMap} from './map'
import {NoteQuery, makeNoteSearchQueryFromValues, makeNoteBboxQueryFromValues} from './query'
import {toUserQuery} from './query-user'
import {toDateQuery} from './query-date'
import {NominatimBbox, NominatimBboxFetcher} from './nominatim'
import {makeElement, makeLink, makeDiv, makeLabel} from './util'

const em=(...ss: Array<string|HTMLElement>)=>makeElement('em')()(...ss)
const code=(...ss: Array<string|HTMLElement>)=>makeElement('code')()(...ss)
const rq=(param: string)=>makeElement('span')('request')(` (`,code(param),` parameter)`)
const rq2=(param1: string, param2: string)=>makeElement('span')('request')(` (`,code(param1),` or `,code(param2),` parameter)`)

export interface NoteFetchDialogSharedCheckboxes {
	showImages: HTMLInputElement[]
	showRequests: HTMLInputElement[]
}

abstract class NoteFetchDialog {
	abstract title: string
	$details=document.createElement('details')
	$fetchButton=document.createElement('button')
	write($container: HTMLElement, $sharedCheckboxes: NoteFetchDialogSharedCheckboxes, submitQuery: (query: NoteQuery) => void) {
		const $summary=document.createElement('summary')
		$summary.textContent=this.title
		const $form=document.createElement('form')
		const $scopeFieldset=this.makeScopeAndOrderFieldset()
		const $downloadFieldset=this.makeDownloadModeFieldset($sharedCheckboxes)
		$form.append(
			$scopeFieldset,
			$downloadFieldset,
			this.makeFetchButtonDiv()
		)
		this.addEventListeners()
		$form.addEventListener('submit',(ev)=>{
			ev.preventDefault()
			const query=this.constructQuery()
			if (!query) return
			submitQuery(query)
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
	protected abstract writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void
	protected abstract writeDownloadModeFieldset($fieldset: HTMLFieldSetElement): void
	protected writeExtraForms(): void {}
	protected abstract addEventListeners(): void
	protected abstract constructQuery(): NoteQuery | undefined
}

export class NoteSearchFetchDialog extends NoteFetchDialog {
	title=`Search notes for user / text / date range`
	$userInput=document.createElement('input')
	$textInput=document.createElement('input')
	$fromInput=document.createElement('input')
	$toInput=document.createElement('input')
	$statusSelect=document.createElement('select')
	$sortSelect=document.createElement('select')
	$orderSelect=document.createElement('select')
	$limitSelect=document.createElement('select')
	$autoLoadCheckbox=document.createElement('input')
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void {
		{
			$fieldset.append(makeDiv('request')(
				`Make a `,makeLink(`search for notes`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Search_for_notes:_GET_.2Fapi.2F0.6.2Fnotes.2Fsearch`),` request at `,code(`https://api.openstreetmap.org/api/0.6/notes/search?`,em(`parameters`)),`; see `,em(`parameters`),` below.`
			))
		}
		{
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
	$bboxInput=document.createElement('input')
	$trackMapCheckbox=document.createElement('input')
	$statusSelect=document.createElement('select')
	$limitSelect=document.createElement('select')
	constructor(private map: NoteMap) {
		super()
	}
	protected writeExtraForms() {
		this.$details.append(this.$nominatimForm)
	}
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void {
		{
			this.$bboxInput.type='text'
			this.$bboxInput.name='bbox'
			this.$bboxInput.required=true // otherwise could submit empty bbox without entering anything
			$fieldset.append(makeDiv('major-input')(makeLabel()(
				`Bounding box (`,
				tip(`left`,`western-most (min) longitude`),`, `,
				tip(`bottom`,`southern-most (min) latitude`),`, `,
				tip(`right`,`eastern-most (max) longitude`),`, `,
				tip(`top`,`northern-most (max) latitude`),
				`): `,this.$bboxInput
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
			this.$nominatimForm.id='nominatim-form'
			this.$nominatimInput.type='text'
			this.$nominatimInput.required=true
			this.$nominatimInput.classList.add('no-invalid-indication') // because it's inside another form that doesn't require it, don't indicate that it's invalid
			this.$nominatimInput.name='place'
			this.$nominatimInput.setAttribute('form','nominatim-form')
			this.$nominatimButton.textContent='Get'
			this.$nominatimButton.setAttribute('form','nominatim-form')
			$fieldset.append(makeDiv('text-button-input')(makeLabel()(
				//`Or get bounding box by place name from `,makeLink(`Nominatim`,'https://wiki.openstreetmap.org/wiki/Nominatim'),`: `, // TODO inconvenient to have links inside form, better do info panels
				`Or get bounding box by place name from Nominatim: `,
				this.$nominatimInput
			),this.$nominatimButton))
		}{
			this.$statusSelect.append(
				new Option(`both open and closed`,'-1'),
				new Option(`open and recently closed`,'7'),
				new Option(`only open`,'0'),
			)
			$fieldset.append(makeDiv()(
				`Fetch `,
				makeLabel('inline')(this.$statusSelect,` matching notes`),` `,
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
				makeLabel()(`at most `,this.$limitSelect,` notes`)
			))
		}
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
		}
		this.map.onMoveEnd(copyBounds)
		this.$trackMapCheckbox.addEventListener('input',copyBounds)
		this.$bboxInput.addEventListener('input',()=>{
			if (!validateBounds()) return
			this.$trackMapCheckbox.checked=false
		})
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