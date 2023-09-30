import type {NominatimProvider} from '../net'
import {NominatimBbox, NominatimBboxFetcher} from '../nominatim'
import makeTextButtonInputGroup from '../text-button-input-group'
import {
	makeElement, makeDiv, makeLink, makeLabel,
	wrapFetchForButton, makeGetKnownErrorMessage
} from '../util/html'
import {em,code} from '../util/html-shortcuts'

const spanRequest=(...ss: Array<string|HTMLElement>)=>makeElement('span')('advanced-hint')(...ss)

let idCount=0
const dumbCache=makeDumbCache() // TODO real cache in db

type StructuredInputs = {
	country: HTMLInputElement
	state: HTMLInputElement
	county: HTMLInputElement
	city: HTMLInputElement
}

export default class NominatimSubForm {
	public $form=document.createElement('form')
	public $structuredForm=document.createElement('form')
	private $input=document.createElement('input')
	private $button=document.createElement('button')
	private $structuredInputs: StructuredInputs = {
		country: document.createElement('input'),
		state: document.createElement('input'),
		county: document.createElement('input'),
		city: document.createElement('input'),
	}
	private $structuredButton=document.createElement('button')
	private $requestOutput=document.createElement('output')
	private $structuredRequestOutput=document.createElement('output')
	private bboxFetcher: NominatimBboxFetcher
	constructor(
		private nominatim: NominatimProvider,
		private getMapBounds: ()=>[w:string,s:string,e:string,n:string],
		private setBbox: (bbox:NominatimBbox)=>void
	) {
		this.bboxFetcher=new NominatimBboxFetcher(nominatim,...dumbCache)
		this.$form.id='nominatim-form-'+idCount
		this.$input.type='text'
		this.$input.required=true
		this.$input.classList.add('no-invalid-indication') // because it's inside another form that doesn't require it, don't indicate that it's invalid
		this.$input.name='place'
		this.$input.setAttribute('form',this.$form.id)
		this.$button.textContent='Get'
		this.$button.setAttribute('form',this.$form.id)
		this.$structuredForm.id='nominatim-structured-form-'+idCount
		for (const [name,$input] of Object.entries(this.$structuredInputs)) {
			$input.type='text'
			$input.size=20
			$input.name=name
			$input.setAttribute('form',this.$structuredForm.id)
		}
		this.$structuredButton.textContent='Get with structured query'
		this.$structuredButton.setAttribute('form',this.$structuredForm.id)
		idCount++
	}
	write($container: HTMLElement): void {
		$container.append(makeDiv('advanced-hint')(
			`Make `,makeLink(`Nominatim search query`,`https://nominatim.org/release-docs/develop/api/Search/`),
			` at `,code(this.nominatim.getSearchUrl(''),em(`parameters`)),`; `,
			em(`parameters`),` are `,code(`viewbox`),` taken from the current map view if the zoom is high enough, `,
			`other `,em(`parameters`),` come from the inputs below.`
		))
		$container.append(
			makeTextButtonInputGroup('spaced')([
				makeElement('span')('label-part','non-advanced')(`Nominatim query`),
				makeElement('span')('label-part','advanced')(`Free-form nominatim query`),
				spanRequest(` (`,code('q'),` Nominatim parameter)`)
			],this.$input,this.$button),
			makeDiv('advanced-hint')(`Resulting Nominatim request: `,this.$requestOutput)
		)
		$container.append(
			makeDiv('input-group','gridded','advanced')(
				...Object.entries(this.$structuredInputs).map(([name,$input])=>makeDiv('input-group','major')(makeLabel()(
					capitalize(name),` `,$input
				))),
			),
			makeDiv('input-group','major','advanced')(this.$structuredButton),
			makeDiv('advanced-hint')(`Resulting Nominatim request: `,this.$structuredRequestOutput)
		)
		function capitalize(s: string): string {
			return s.slice(0,1).toUpperCase()+s.slice(1)
		}
	}
	updateRequest(): void {
		const url=this.nominatim.getSearchUrl(this.parameters)
		const $a=makeLink(url,url)
		$a.classList.add('request')
		this.$requestOutput.replaceChildren(code($a))
	}
	updateStructuredRequest(): void {
		const url=this.nominatim.getSearchUrl(this.structuredParameters)
		const $a=makeLink(url,url)
		$a.classList.add('request')
		this.$structuredRequestOutput.replaceChildren(code($a))
	}
	addEventListeners(): void {
		this.$input.addEventListener('input',()=>this.updateRequest())
		this.$form.onsubmit=(ev)=>wrapFetchForButton(this.$button,async()=>{
			ev.preventDefault()
			const bbox=await this.bboxFetcher.fetch(
				Date.now(),this.parameters
			)
			this.setBbox(bbox)
		},makeGetKnownErrorMessage(TypeError))
		for (const $input of Object.values(this.$structuredInputs)) {
			$input.addEventListener('input',()=>this.updateStructuredRequest())
		}
		this.$structuredForm.onsubmit=(ev)=>wrapFetchForButton(this.$structuredButton,async()=>{
			ev.preventDefault()
			const bbox=await this.bboxFetcher.fetch(
				Date.now(),this.structuredParameters
			)
			this.setBbox(bbox)
		},makeGetKnownErrorMessage(TypeError))
	}
	private get parameters(): string {
		return this.bboxFetcher.getParameters(
			this.$input.value,
			this.getMapBounds()
		)
	}
	private get structuredParameters(): string {
		const values: {[name:string]: string} = {}
		for (const [name,$input] of Object.entries(this.$structuredInputs)) {
			const value=$input.value.trim()
			if (!value) continue
			values[name]=value
		}
		return this.bboxFetcher.getStructuredParameters(
			values,
			this.getMapBounds()
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
