import {NoteQuery} from '../query'
import {makeElement, makeLink, makeDiv, makeLabel} from '../util'

const sup=(...ss: Array<string|HTMLElement>)=>makeElement('sup')()(...ss)
const code=(...ss: Array<string|HTMLElement>)=>makeElement('code')()(...ss)

export interface NoteFetchDialogSharedCheckboxes {
	showImages: HTMLInputElement[]
	showRequests: HTMLInputElement[]
}

export abstract class NoteFetchDialog {
	abstract title: string
	protected $details=document.createElement('details')
	protected $form=document.createElement('form')
	$limitSelect=document.createElement('select')
	private $requestOutput=document.createElement('output')
	constructor(
		private getRequestUrls: (query: NoteQuery, limit: number) => [type: string, url: string][],
		protected submitQuery: (query: NoteQuery) => void
	) {}
	write($container: HTMLElement, $sharedCheckboxes: NoteFetchDialogSharedCheckboxes, initialQuery: NoteQuery|undefined) {
		const $summary=document.createElement('summary')
		$summary.textContent=this.title
		const appendIfExists=(...$es: Array<HTMLElement|undefined>)=>{
			for (const $e of $es) {
				if ($e) this.$form.append($e)
			}
		}
		appendIfExists(
			this.makePrependedFieldset(),
			this.makeScopeAndOrderFieldset(),
			this.makeDownloadModeFieldset($sharedCheckboxes),
			this.makeFetchControlDiv(),
			this.makeRequestDiv()
		)
		this.populateInputs(initialQuery)
		this.addEventListeners()
		this.addRequestChangeListeners()
		this.$form.addEventListener('submit',(ev)=>{
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
		this.$details.append($summary,this.$form)
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
	private makePrependedFieldset(): HTMLFieldSetElement|undefined {
		const $fieldset=document.createElement('fieldset')
		const $legend=document.createElement('legend')
		this.writePrependedFieldset($fieldset,$legend)
		if ($fieldset.childElementCount==0) return
		$fieldset.prepend($legend)
		return $fieldset
	}
	private makeScopeAndOrderFieldset(): HTMLFieldSetElement|undefined {
		const $fieldset=document.createElement('fieldset')
		const $legend=document.createElement('legend')
		$legend.textContent=`Scope and order`
		this.writeScopeAndOrderFieldset($fieldset,$legend)
		if ($fieldset.childElementCount==0) return
		$fieldset.prepend($legend)
		return $fieldset
	}
	private makeDownloadModeFieldset($sharedCheckboxes: NoteFetchDialogSharedCheckboxes): HTMLFieldSetElement|undefined {
		const $fieldset=document.createElement('fieldset')
		// TODO (re)store input values
		const $legend=document.createElement('legend')
		$legend.textContent=`Download mode (can change anytime)`
		$fieldset.append($legend)
		this.writeDownloadModeFieldset($fieldset,$legend)
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
	private makeRequestDiv() {
		return makeDiv('request')(`Resulting request: `,this.$requestOutput)
	}
	private addRequestChangeListeners() {
		for (const $input of this.listQueryChangingInputs()) {
			$input.addEventListener('input',()=>this.updateRequest())
		}
		this.$limitSelect.addEventListener('input',()=>this.updateRequest())
	}
	protected abstract makeFetchControlDiv(): HTMLDivElement
	protected writePrependedFieldset($fieldset: HTMLFieldSetElement, $legend: HTMLLegendElement): void {}
	protected abstract writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement, $legend: HTMLLegendElement): void
	protected abstract writeDownloadModeFieldset($fieldset: HTMLFieldSetElement, $legend: HTMLLegendElement): void
	protected writeExtraForms(): void {}
	protected abstract populateInputsWithoutUpdatingRequest(query: NoteQuery|undefined): void
	protected abstract addEventListeners(): void
	protected abstract constructQuery(): NoteQuery | undefined
	protected abstract listQueryChangingInputs(): Array<HTMLInputElement|HTMLSelectElement>
}

export abstract class NoteButtonFetchDialog extends NoteFetchDialog {
	$fetchButton=document.createElement('button')
	protected makeFetchControlDiv(): HTMLDivElement {
		this.$fetchButton.textContent=`Fetch notes`
		this.$fetchButton.type='submit'
		return makeDiv('major-input')(this.$fetchButton)
	}
}
