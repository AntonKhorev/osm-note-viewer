import {NavDialog} from '../navbar'
import {NoteQuery} from '../query'
import {makeElement, makeLink, makeDiv, makeLabel} from '../util'

const sup=(...ss: Array<string|HTMLElement>)=>makeElement('sup')()(...ss)
const code=(...ss: Array<string|HTMLElement>)=>makeElement('code')()(...ss)

export type MapFreezeMode = 'no' | 'initial' | 'full'

export interface NoteFetchDialogSharedCheckboxes {
	showImages: HTMLInputElement[]
	showRequests: HTMLInputElement[]
}

export abstract class NoteFetchDialog extends NavDialog {
	protected $form=document.createElement('form')
	$limitSelect=document.createElement('select')
	private $requestOutput=document.createElement('output')
	constructor(
		private $sharedCheckboxes: NoteFetchDialogSharedCheckboxes,
		private getRequestUrls: (query: NoteQuery, limit: number) => [type: string, url: string][],
		protected submitQuery: (query: NoteQuery) => void
	) {
		super()
	}
	writeSectionContent() {
		const appendIfExists=(...$es: Array<HTMLElement|undefined>)=>{
			for (const $e of $es) {
				if ($e) this.$form.append($e)
			}
		}
		appendIfExists(
			this.makePrependedFieldset(),
			this.makeScopeAndOrderFieldset(),
			this.makeDownloadModeFieldset(),
			this.makeFetchControlDiv(),
			this.makeRequestDiv()
		)
		this.addEventListeners()
		this.addRequestChangeListeners()
		this.$form.addEventListener('submit',(ev)=>{
			ev.preventDefault()
			const query=this.constructQuery()
			if (!query) return
			this.submitQuery(query)
		})
		this.$section.append(this.$form)
		this.writeExtraForms()
	}
	populateInputs(query: NoteQuery|undefined): void {
		this.populateInputsWithoutUpdatingRequest(query)
		this.updateRequest()
	}
	get mapFreezeMode(): MapFreezeMode {
		return 'no'
	}
	abstract disableFetchControl(disabled: boolean): void
	abstract getAutoLoadChecker(): {checked:boolean}
	protected updateRequest(): void {
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
	private makeDownloadModeFieldset(): HTMLFieldSetElement|undefined {
		const $fieldset=document.createElement('fieldset')
		// TODO (re)store input values
		const $legend=document.createElement('legend')
		$legend.textContent=`Download mode (can change anytime)`
		$fieldset.append($legend)
		this.writeDownloadModeFieldset($fieldset,$legend)
		const $showImagesCheckbox=document.createElement('input')
		$showImagesCheckbox.type='checkbox'
		this.$sharedCheckboxes.showImages.push($showImagesCheckbox)
		$fieldset.append(makeDiv()(makeLabel()(
			$showImagesCheckbox,` Load and show images from StreetComplete`
		)))
		const $showRequestsCheckbox=document.createElement('input')
		$showRequestsCheckbox.type='checkbox'
		this.$sharedCheckboxes.showRequests.push($showRequestsCheckbox)
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
	/**
	 * Populates inputs on matching query; clears inputs on undefined
	 */
	protected abstract populateInputsWithoutUpdatingRequest(query: NoteQuery|undefined): void
	protected abstract addEventListeners(): void
	protected abstract constructQuery(): NoteQuery | undefined
	protected abstract listQueryChangingInputs(): Array<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>
}

export function mixinWithAutoLoadCheckbox<T extends abstract new (...args: any[]) => any>(c: T) {
	abstract class WithAutoLoadCheckbox extends c {
		protected $autoLoadCheckbox=document.createElement('input')
		getAutoLoadChecker(): {checked: boolean} {
			return this.$autoLoadCheckbox
		}
	}
	return WithAutoLoadCheckbox
}

export function mixinWithFetchButton<T extends abstract new (...args: any[]) => any>(c: T) {
	abstract class WithFetchButton extends c {
		protected $fetchButton=document.createElement('button')
		protected makeFetchControlDiv(): HTMLDivElement {
			this.$fetchButton.textContent=`Fetch notes`
			this.$fetchButton.type='submit'
			return makeDiv('major-input')(this.$fetchButton)
		}
		disableFetchControl(disabled: boolean): void {
			this.$fetchButton.disabled=disabled
		}
	}
	return WithFetchButton
}

export abstract class NoteIdsFetchDialog extends mixinWithAutoLoadCheckbox(NoteFetchDialog) {
	protected writeDownloadModeFieldset($fieldset: HTMLFieldSetElement): void {
		{
			this.$limitSelect.append(
				new Option('5'),
				new Option('20'),
			)
			$fieldset.append(makeDiv()(
				`Download these `,
				makeLabel()(
					`in batches of `,this.$limitSelect,` notes`,
					makeElement('span')('request')(` (will make this many API requests each time it downloads more notes)`)
				)
			))
		}{
			this.$autoLoadCheckbox.type='checkbox'
			this.$autoLoadCheckbox.checked=true
			$fieldset.append(makeDiv()(makeLabel()(
				this.$autoLoadCheckbox,` Automatically load more notes when scrolled to the end of the table`
			)))
		}
	}
}
