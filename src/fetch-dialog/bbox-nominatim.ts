import type {NominatimProvider} from '../server'
import {NominatimBbox, NominatimBboxFetcher} from '../nominatim'
import {
	makeElement, makeLink, makeDiv, makeLabel,
	wrapFetchForButton, makeGetKnownErrorMessage
} from '../html'
import {em,code} from '../html-shortcuts'

const spanRequest=(...ss: Array<string|HTMLElement>)=>makeElement('span')('advanced-hint')(...ss)

export default class NominatimSubForm {
	public $form=document.createElement('form')
	private $input=document.createElement('input')
	private $button=document.createElement('button')
	private $requestOutput=document.createElement('output')
	private bboxFetcher: NominatimBboxFetcher
	constructor(
		private nominatim: NominatimProvider,
		private getMapBounds: ()=>L.LatLngBounds,
		private setBbox: (bbox:NominatimBbox)=>void
	) {
		this.bboxFetcher=new NominatimBboxFetcher(
			nominatim,...makeDumbCache() // TODO real cache in db
		)
		this.$form.id='nominatim-form'
	}
	write($fieldset: HTMLFieldSetElement): void {
		$fieldset.append(makeDiv('advanced-hint')(
			`Make `,makeLink(`Nominatim search query`,`https://nominatim.org/release-docs/develop/api/Search/`),
			` at `,code(this.nominatim.getSearchUrl(''),em(`parameters`)),`; see `,em(`parameters`),` above and below.`
		))
		this.$input.type='text'
		this.$input.required=true
		this.$input.classList.add('no-invalid-indication') // because it's inside another form that doesn't require it, don't indicate that it's invalid
		this.$input.name='place'
		this.$input.setAttribute('form','nominatim-form')
		this.$button.textContent='Get'
		this.$button.setAttribute('form','nominatim-form')
		$fieldset.append(makeDiv('text-button-input')(makeLabel()(
			`Or get bounding box by place name from Nominatim`,spanRequest(` (`,code('q'),` Nominatim parameter)`),` `,
			this.$input
		),this.$button))
		$fieldset.append(makeDiv('advanced-hint')(`Resulting Nominatim request: `,this.$requestOutput))
	}
	updateRequest(): void {
		const bounds=this.getMapBounds()
		const parameters=this.bboxFetcher.getParameters(
			this.$input.value,
			bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()
		)
		const url=this.nominatim.getSearchUrl(parameters)
		const $a=makeLink(url,url)
		$a.classList.add('request')
		this.$requestOutput.replaceChildren(code($a))
	}
	addEventListeners(): void {
		this.$input.addEventListener('input',()=>this.updateRequest())
		this.$form.onsubmit=(ev)=>wrapFetchForButton(this.$button,async()=>{
			ev.preventDefault()
			const bounds=this.getMapBounds()
			const bbox=await this.bboxFetcher.fetch(
				Date.now(),
				this.$input.value,
				bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()
			)
			this.setBbox(bbox)
		},makeGetKnownErrorMessage(TypeError))
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
