import type {Connection} from '../net'
import {NavDialog} from '../navbar'
import type {NoteQuery} from '../query'
import {makeActionIcon} from '../svg'
import {bubbleCustomEvent} from '../util/events'
import {makeElement, makeLink, makeSemiLink, makeDiv, makeLabel} from '../util/html'
import {sup,code} from '../util/html-shortcuts'

export interface NoteFetchDialogSharedCheckboxes {
	showImages: HTMLInputElement[]
	advancedMode: HTMLInputElement[]
}

export default abstract class NoteFetchDialog extends NavDialog {
	limitChangeListener?: ()=>void
	$form=document.createElement('form')
	protected withAutoload=false
	protected $autoLoadCheckbox: HTMLInputElement|undefined
	protected $advancedModeCheckbox=document.createElement('input')
	protected $limitSelect=document.createElement('select')
	protected $limitInput=document.createElement('input')
	protected abstract limitValues: number[]
	protected abstract limitDefaultValue: number
	protected abstract limitLeadText: string
	protected abstract limitLabelBeforeText: string
	protected abstract limitLabelAfterText: string
	protected abstract limitIsParameter: boolean
	private $requestOutput=document.createElement('output')
	protected $fetchControl: HTMLButtonElement|HTMLInputElement|undefined
	constructor(
		protected $root: HTMLElement,
		private $sharedCheckboxes: NoteFetchDialogSharedCheckboxes,
		protected cx: Connection,
		private getRequestApiPaths: (query: NoteQuery, limit: number) => [type: string, apiPath: string][],
		protected submitQuery: (query: NoteQuery, isTriggeredBySubmitButton: boolean) => void,
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
			...this.makePrependedFieldsets(),
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
	fetchIfValid(): void {
		if (!this.$form.checkValidity()) return
		const query=this.constructQuery()
		if (!query) return
		this.submitQuery(query,false)
	}
	disableFetchControl(disabled: boolean): void {
		if (this.$fetchControl) {
			this.$fetchControl.disabled=disabled
		}
	}
	get getLimit(): ()=>number {
		return ()=>{
			let limit: number
			if (this.$advancedModeCheckbox.checked) {
				limit=Number(this.$limitInput.value)
			} else {
				limit=Number(this.$limitSelect.value)
			}
			if (Number.isInteger(limit) && limit>=1 && limit<=10000) return limit
			return this.limitDefaultValue
		}
	}
	get getAutoLoad(): ()=>boolean {
		return ()=>{
			if (!this.$autoLoadCheckbox) return false
			return this.$autoLoadCheckbox.checked
		}
	}
	getQueryCaption(query: NoteQuery): HTMLTableCaptionElement {
		return makeElement('caption')()(`notes`)
	}
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
		const requestApiPaths=this.getRequestApiPaths(query,this.getLimit())
		if (requestApiPaths.length==0) {
			this.$requestOutput.replaceChildren(`invalid request`)
			return
		}
		const [[mainType,mainApiPath],...otherRequestApiPaths]=requestApiPaths
		const mainUrl=this.cx.server.api.getUrl(mainApiPath)
		const $a=makeLink(mainUrl,mainUrl)
		$a.classList.add('request')
		this.$requestOutput.replaceChildren(code($a),` in ${mainType} format`)
		appendLinkIfKnown(mainType)
		if (otherRequestApiPaths.length>0) {
			this.$requestOutput.append(` or other formats: `)
		}
		let first=true
		for (const [type,apiPath] of otherRequestApiPaths) {
			if (first) {
				first=false
			} else {
				this.$requestOutput.append(`, `)
			}
			const url=this.cx.server.api.getUrl(apiPath)
			this.$requestOutput.append(code(makeLink(type,url)))
			appendLinkIfKnown(type)
		}
	}
	private makePrependedFieldsets(): HTMLFieldSetElement[] {
		const $fieldsets: HTMLFieldSetElement[] = []
		for (const writeFieldset of this.listPrependedFieldsets()) {
			const $fieldset=document.createElement('fieldset')
			const $legend=document.createElement('legend')
			writeFieldset($fieldset,$legend)
			$fieldset.prepend($legend)
			$fieldsets.push($fieldset)
		}
		return $fieldsets
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
			$fieldset.append(makeDiv('input-group','non-advanced')(
				this.limitLeadText,
				makeLabel()(
					this.limitLabelBeforeText,this.$limitSelect,this.limitLabelAfterText
				)
			),makeDiv('input-group','advanced')(
				this.limitLeadText,
				makeLabel()(
					this.limitLabelBeforeText,this.$limitInput,this.limitLabelAfterText,
					(this.limitIsParameter
						? makeElement('span')('advanced-hint')(` (`,code('limit'),` parameter)`)
						: makeElement('span')('advanced-hint')(` (will make this many API requests each time it downloads more notes)`)
					)
				)
			))
		}
		if (this.withAutoload) {
			this.$autoLoadCheckbox=document.createElement('input')
			this.$autoLoadCheckbox.type='checkbox'
			this.$autoLoadCheckbox.checked=true
			$fieldset.append(makeDiv('input-group')(makeLabel()(
				this.$autoLoadCheckbox,` Automatically load more notes when scrolled to the end of the table`
			)))
		}
		const $showImagesCheckbox=document.createElement('input')
		$showImagesCheckbox.type='checkbox'
		this.$sharedCheckboxes.showImages.push($showImagesCheckbox)
		const $trustedSourcesLink=makeSemiLink('input-link')(`trusted sources`)
		$trustedSourcesLink.onclick=ev=>{
			bubbleCustomEvent(this.$root,'osmNoteViewer:menuToggle','image-sources')
			ev.stopPropagation()
			ev.preventDefault()
		}
		$fieldset.append(makeDiv('input-group')(makeLabel()(
			$showImagesCheckbox,` Load and show images from `,$trustedSourcesLink
		)))
		this.$advancedModeCheckbox.type='checkbox'
		this.$sharedCheckboxes.advancedMode.push(this.$advancedModeCheckbox)
		$fieldset.append(makeDiv('input-group')(makeLabel()(
			this.$advancedModeCheckbox,` Advanced mode`
		)))
		return $fieldset
	}
	private makeRequestDiv() {
		return makeDiv('advanced-hint')(`Resulting request: `,this.$requestOutput)
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
			this.$limitSelect.value=String(findClosestValue(Number(this.$limitInput.value),this.limitValues))
			this.updateRequest()
			if (this.limitChangeListener) this.limitChangeListener()
			function findClosestValue(vTarget: number, vCandidates: number[]): number {
				let dResult=Infinity
				let vResult=vTarget
				for (const vCandidate of vCandidates) {
					const dCandidate=Math.abs(vTarget-vCandidate)
					if (dCandidate<dResult) {
						dResult=dCandidate
						vResult=vCandidate
					}
				}
				return vResult
			}
		})
		this.$form.addEventListener('submit',(ev)=>{
			ev.preventDefault()
			const query=this.constructQuery()
			if (!query) return
			this.submitQuery(query,true)
		})
	}
	reactToAdvancedModeChange() {
		if (this.$limitSelect.value!=this.$limitInput.value) {
			this.updateRequest()
			if (this.limitChangeListener) this.limitChangeListener()
		}
	}
	/**
	 * Adds fetch control, usually a 'fetch notes' button
	 *
	 * Override to make different control and set this.$fetchControl inside
	 */
	protected makeFetchControlDiv(): HTMLDivElement {
		this.$fetchControl=document.createElement('button')
		this.$fetchControl.append(makeActionIcon('download'),` Fetch notes`)
		this.$fetchControl.type='submit'
		return makeDiv('input-group','major')(this.$fetchControl)
	}
	protected listPrependedFieldsets(): (($fieldset:HTMLFieldSetElement,$legend:HTMLLegendElement)=>void)[] { return [] }
	protected abstract writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement, $legend: HTMLLegendElement): void
	protected writeExtraForms(): void {}
	/**
	 * Populates inputs on matching query; clears inputs on undefined
	 */
	protected abstract populateInputsWithoutUpdatingRequest(query: NoteQuery|undefined): void
	protected abstract addEventListeners(): void
	protected abstract constructQuery(): NoteQuery | undefined
	protected abstract listQueryChangingInputs(): Array<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>
	protected makeInputLink($input: HTMLInputElement|HTMLTextAreaElement, text: string): HTMLAnchorElement {
		const $a=makeElement('a')('input-link')(text)
		$a.tabIndex=0
		$a.dataset.inputName=$input.name
		return $a
	}
}
