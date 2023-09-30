import type {NominatimProvider} from '../net'
import {NominatimBbox, NominatimBboxFetcher} from '../nominatim'
import makeTextButtonInputGroup from '../text-button-input-group'
import {
	makeElement, makeLink, makeDiv,
	wrapFetchForButton, makeGetKnownErrorMessage
} from '../util/html'
import {em,code} from '../util/html-shortcuts'

const spanRequest=(...ss: Array<string|HTMLElement>)=>makeElement('span')('advanced-hint')(...ss)

let idCount=0
const dumbCache=makeDumbCache() // TODO real cache in db

export default class NominatimSubForm {
	public $form=document.createElement('form')
	private $input=document.createElement('input')
	private $button=document.createElement('button')
	private $requestOutput=document.createElement('output')
	private bboxFetcher: NominatimBboxFetcher
	constructor(
		private nominatim: NominatimProvider,
		private getMapBounds: ()=>[w:string,s:string,e:string,n:string],
		private setBbox: (bbox:NominatimBbox)=>void
	) {
		this.bboxFetcher=new NominatimBboxFetcher(nominatim,...dumbCache)
		this.$form.id='nominatim-form-'+idCount++
		this.$input.type='text'
		this.$input.required=true
		this.$input.classList.add('no-invalid-indication') // because it's inside another form that doesn't require it, don't indicate that it's invalid
		this.$input.name='place'
		this.$input.setAttribute('form',this.$form.id)
		this.$button.textContent='Get'
		this.$button.setAttribute('form',this.$form.id)
	}
	write($container: HTMLElement): void {
		$container.append(makeDiv('advanced-hint')(
			`Make `,makeLink(`Nominatim search query`,`https://nominatim.org/release-docs/develop/api/Search/`),
			` at `,code(this.nominatim.getSearchUrl(''),em(`parameters`)),`; `,
			em(`parameters`),` are `,code(`viewbox`),` taken from the current map view if the zoom is high enough, `,
			`other `,em(`parameters`),` come from the inputs below.`
		))
		$container.append(makeTextButtonInputGroup('spaced')([
			`Nominatim query`,spanRequest(` (`,code('q'),` Nominatim parameter, free-form query)`)
		],this.$input,this.$button))
		$container.append(makeDiv('advanced-hint')(`Resulting Nominatim request: `,this.$requestOutput))
	}
	updateRequest(): void {
		const parameters=this.bboxFetcher.getParameters(
			this.$input.value,
			this.getMapBounds()
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
			const bbox=await this.bboxFetcher.fetch(
				Date.now(),
				this.$input.value,
				this.getMapBounds()
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
