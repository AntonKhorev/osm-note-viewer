import type Auth from '../auth'
import {NavDialog} from '../navbar'
import type {NoteQuery} from '../query'
import {makeElement, makeLink, makeDiv, makeLabel} from '../html'
import {em,sup,code} from '../html-shortcuts'

export interface NoteFetchDialogSharedCheckboxes {
	showImages: HTMLInputElement[]
	advancedMode: HTMLInputElement[]
}

export abstract class NoteFetchDialog extends NavDialog {
	limitChangeListener?: ()=>void
	$form=document.createElement('form')
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
	constructor(
		protected $root: HTMLElement,
		private $sharedCheckboxes: NoteFetchDialogSharedCheckboxes,
		protected auth: Auth,
		private getRequestApiPaths: (query: NoteQuery, limit: number) => [type: string, apiPath: string][],
		protected submitQuery: (query: NoteQuery) => void,
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
	abstract get getAutoLoad(): ()=>boolean
	getQueryCaption(query: NoteQuery): HTMLTableCaptionElement {
		return makeElement('caption')()(`Fetched notes`)
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
		const mainUrl=this.auth.server.api.getUrl(mainApiPath)
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
			const url=this.auth.server.api.getUrl(apiPath)
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
					(this.limitIsParameter
						? makeElement('span')('advanced-hint')(` (`,code('limit'),` parameter)`)
						: makeElement('span')('advanced-hint')(` (will make this many API requests each time it downloads more notes)`)
					)
				)
			))
		}
		this.writeDownloadModeFieldset($fieldset,$legend)
		const $showImagesCheckbox=document.createElement('input')
		$showImagesCheckbox.type='checkbox'
		this.$sharedCheckboxes.showImages.push($showImagesCheckbox)
		$fieldset.append(makeDiv('regular-input')(makeLabel()(
			$showImagesCheckbox,` Load and show images from StreetComplete`
		)))
		this.$advancedModeCheckbox.type='checkbox'
		this.$sharedCheckboxes.advancedMode.push(this.$advancedModeCheckbox)
		$fieldset.append(makeDiv('regular-input')(makeLabel()(
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
			this.submitQuery(query)
		})
	}
	reactToAdvancedModeChange() {
		if (this.$limitSelect.value!=this.$limitInput.value) {
			this.updateRequest()
			if (this.limitChangeListener) this.limitChangeListener()
		}
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

export abstract class NoteQueryFetchDialog extends mixinWithFetchButton(NoteFetchDialog) {
	protected $closedInput=document.createElement('input')
	protected $closedSelect=document.createElement('select')
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void {
		{
			$fieldset.append(makeDiv('advanced-hint')(
				...this.makeLeadAdvancedHint()
			))
		}{
			const $table=document.createElement('table')
			{
				const $row=$table.insertRow()
				$row.append(
					makeElement('th')()(`parameter`),
					makeElement('th')()(`description`)
				)
			}
			const makeTr=(cellType: 'th'|'td')=>(...sss: Array<Array<string|HTMLElement>>)=>makeElement('tr')()(...sss.map(ss=>makeElement(cellType)()(...ss)))
			const closedDescriptionItems: Array<string|HTMLElement> = [
				`Max number of days for closed note to be visible. `,
				`In `,em(`advanced mode`),` can be entered as a numeric value. `,
				`When `,em(`advanced mode`),` is disabled this parameter is available as a dropdown menu with the following values: `,
				makeElement('table')()(
					makeTr('th')([`label`],[`value`],[`description`]),
					makeTr('td')([em(`both open and closed`)],[code(`-1`)],[
						`Special value to ignore how long ago notes were closed. `,
						`This is the default value for `,em(`note-viewer`),` because it's the most useful one in conjunction with searching for a given user's notes.`
					]),
					makeTr('td')([em(`open and recently closed`)],[code(`7`)],[
						`The most common value used in other apps like the OSM website.`
					]),
					makeTr('td')([em(`only open`)],[code(`0`)],[
						`Ignore closed notes.`
					])
				)
			]
			for (const [parameter,$input,descriptionItems] of this.listParameters(closedDescriptionItems)) {
				const $row=$table.insertRow()
				const $parameter=makeElement('code')('linked-parameter')(parameter) // TODO <a> or other focusable element
				$parameter.onclick=()=>$input.focus()
				$row.insertCell().append($parameter)
				$row.insertCell().append(...descriptionItems)
			}
			$fieldset.append(makeDiv('advanced-hint')(
				makeElement('details')()(
					makeElement('summary')()(`Supported parameters`),
					$table
				)
			))
		}
		this.writeScopeAndOrderFieldsetBeforeClosedLine($fieldset)
		{
			this.$closedInput.type='number'
			this.$closedInput.min='-1'
			this.$closedInput.value='-1'
			this.$closedSelect.append(
				new Option(`both open and closed`,'-1'),
				new Option(`open and recently closed`,'7'),
				new Option(`only open`,'0'),
			)
			const $closedLine=makeDiv('regular-input')(
				`Fetch `,
				makeElement('span')('non-advanced-input')(
					this.$closedSelect
				),
				` matching notes `,
				makeLabel('advanced-input')(
					`closed no more than `,
					this.$closedInput,
					makeElement('span')('advanced-hint')(` (`,code('closed'),` parameter)`),
					` days ago`
				)
			)
			this.appendToClosedLine($closedLine)
			$fieldset.append($closedLine)
		}
	}
	protected abstract makeLeadAdvancedHint(): Array<string|HTMLElement>
	protected abstract listParameters(closedDescriptionItems: Array<string|HTMLElement>): [parameter: string, $input: HTMLElement, descriptionItems: Array<string|HTMLElement>][]
	protected abstract writeScopeAndOrderFieldsetBeforeClosedLine($fieldset: HTMLFieldSetElement): void
	protected abstract appendToClosedLine($div: HTMLElement): void
	protected addEventListeners(): void {
		this.addEventListenersBeforeClosedLine()
		this.$closedSelect.addEventListener('input',()=>{
			this.$closedInput.value=this.$closedSelect.value
		})
		this.$closedInput.addEventListener('input',()=>{
			this.$closedSelect.value=String(restrictClosedSelectValue(Number(this.$closedInput.value)))
		})
	}
	protected abstract addEventListenersBeforeClosedLine(): void
	protected populateInputsWithoutUpdatingRequest(query: NoteQuery|undefined): void {
		this.populateInputsWithoutUpdatingRequestExceptForClosedInput(query)
		if (query && (query.mode=='search' || query.mode=='bbox')) {
			this.$closedInput.value=String(query.closed)
			this.$closedSelect.value=String(restrictClosedSelectValue(query.closed))
		} else {
			this.$closedInput.value='-1'
			this.$closedSelect.value='-1'
		}
	}
	protected abstract populateInputsWithoutUpdatingRequestExceptForClosedInput(query: NoteQuery|undefined): void
	protected get closedValue(): string {
		return (this.$advancedModeCheckbox.checked
			? this.$closedInput.value
			: this.$closedSelect.value
		)
	}
}

export abstract class NoteIdsFetchDialog extends mixinWithAutoLoadCheckbox(NoteFetchDialog) {
	protected limitValues=[5,20]
	protected limitDefaultValue=5
	protected limitLeadText=`Download these `
	protected limitLabelBeforeText=`in batches of `
	protected limitLabelAfterText=` notes`
	protected limitIsParameter=false
	protected writeDownloadModeFieldset($fieldset: HTMLFieldSetElement): void {
		{
			this.$autoLoadCheckbox.type='checkbox'
			this.$autoLoadCheckbox.checked=true
			$fieldset.append(makeDiv('regular-input')(makeLabel()(
				this.$autoLoadCheckbox,` Automatically load more notes when scrolled to the end of the table`
			)))
		}
	}
}

function restrictClosedSelectValue(v: number): number {
	if (v<0) {
		return -1
	} else if (v<1) {
		return 0
	} else {
		return 7
	}
}
