import {NavDialog} from '../navbar'
import {NoteQuery} from '../query'
import {makeElement, makeLink, makeDiv, makeLabel} from '../util'

const sup=(...ss: Array<string|HTMLElement>)=>makeElement('sup')()(...ss)
const code=(...ss: Array<string|HTMLElement>)=>makeElement('code')()(...ss)

export interface NoteFetchDialogSharedCheckboxes {
	showImages: HTMLInputElement[]
	advancedMode: HTMLInputElement[]
}

export abstract class NoteFetchDialog extends NavDialog {
	limitChangeListener?: ()=>void
	protected $form=document.createElement('form')
	private $limitSelect=document.createElement('select')
	private $limitInput=document.createElement('input')
	protected abstract limitValues: number[]
	protected abstract limitDefaultValue: number
	protected abstract limitLeadText: string
	protected abstract limitLabelBeforeText: string
	protected abstract limitLabelAfterText: string
	protected abstract limitAdvancedText: string
	private $requestOutput=document.createElement('output')
	constructor(
		private $sharedCheckboxes: NoteFetchDialogSharedCheckboxes,
		private getRequestUrls: (query: NoteQuery, limit: number) => [type: string, url: string][],
		protected submitQuery: (query: NoteQuery) => void
	) {
		super()
	}
	resetFetch() {}
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
		this.addCommonEventListeners()
		this.$section.append(this.$form)
		this.writeExtraForms()
	}
	populateInputs(query: NoteQuery|undefined): void {
		this.populateInputsWithoutUpdatingRequest(query)
		this.updateRequest()
	}
	abstract disableFetchControl(disabled: boolean): void
	get getLimit(): ()=>number {
		return ()=>{
			const limit=Number(this.$limitInput.value)
			if (Number.isInteger(limit) && limit>=1 && limit<=10000) return limit
			return this.limitDefaultValue
		}
	}
	abstract get getAutoLoad(): ()=>boolean
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
		const requestUrls=this.getRequestUrls(query,this.getLimit())
		if (requestUrls.length==0) {
			this.$requestOutput.replaceChildren(`invalid request`)
			return
		}
		const [[mainType,mainUrl],...otherRequestUrls]=requestUrls
		const $a=makeLink(mainUrl,mainUrl)
		$a.classList.add('request')
		this.$requestOutput.replaceChildren(code($a),` in ${mainType} format`)
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
		{
			for (const limitValue of this.limitValues) {
				const value=String(limitValue)
				const selected=limitValue==this.limitDefaultValue
				this.$limitSelect.append(new Option(value,value,selected,selected))
			}
			this.$limitInput.type='number'
			this.$limitInput.min='1'
			this.$limitInput.max='10000'
			this.$limitInput.value=String(this.limitDefaultValue)
			$fieldset.append(makeDiv('non-advanced-input')(
				this.limitLeadText,
				makeLabel()(
					this.limitLabelBeforeText,this.$limitSelect,this.limitLabelAfterText
				)
			),makeDiv('advanced-input')(
				this.limitLeadText,
				makeLabel()(
					this.limitLabelBeforeText,this.$limitInput,this.limitLabelAfterText,
					makeElement('span')('advanced')(this.limitAdvancedText)
				)
			))
		}
		this.writeDownloadModeFieldset($fieldset,$legend)
		const $showImagesCheckbox=document.createElement('input')
		$showImagesCheckbox.type='checkbox'
		this.$sharedCheckboxes.showImages.push($showImagesCheckbox)
		$fieldset.append(makeDiv()(makeLabel()(
			$showImagesCheckbox,` Load and show images from StreetComplete`
		)))
		const $advancedModeCheckbox=document.createElement('input')
		$advancedModeCheckbox.type='checkbox'
		this.$sharedCheckboxes.advancedMode.push($advancedModeCheckbox)
		$fieldset.append(makeDiv()(makeLabel()(
			$advancedModeCheckbox,` Advanced mode`
		)))
		return $fieldset
	}
	private makeRequestDiv() {
		return makeDiv('advanced')(`Resulting request: `,this.$requestOutput)
	}
	private addCommonEventListeners() {
		for (const $input of this.listQueryChangingInputs()) {
			$input.addEventListener('input',()=>this.updateRequest())
		}
		this.$limitSelect.addEventListener('input',()=>{
			this.$limitInput.value=this.$limitSelect.value
			this.updateRequest()
			if (this.limitChangeListener) this.limitChangeListener()
		})
		this.$limitInput.addEventListener('input',()=>{
			// TODO find closes value of select
			this.updateRequest()
			if (this.limitChangeListener) this.limitChangeListener()
		})
		this.$form.addEventListener('submit',(ev)=>{
			ev.preventDefault()
			const query=this.constructQuery()
			if (!query) return
			this.submitQuery(query)
		})
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
		get getAutoLoad(): ()=>boolean {
			return ()=>this.$autoLoadCheckbox.checked
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
	protected limitValues=[5,20]
	protected limitDefaultValue=5
	protected limitLeadText=`Download these `
	protected limitLabelBeforeText=`in batches of `
	protected limitLabelAfterText=` notes`
	protected limitAdvancedText=` (will make this many API requests each time it downloads more notes)`
	protected writeDownloadModeFieldset($fieldset: HTMLFieldSetElement): void {
		{
			this.$autoLoadCheckbox.type='checkbox'
			this.$autoLoadCheckbox.checked=true
			$fieldset.append(makeDiv()(makeLabel()(
				this.$autoLoadCheckbox,` Automatically load more notes when scrolled to the end of the table`
			)))
		}
	}
}
