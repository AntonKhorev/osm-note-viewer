import type {NoteQuery} from '../query'
import {NoteFetchDialog, mixinWithFetchButton} from './base'
import {makeElement, makeDiv, makeLabel} from '../util/html'
import {em,code} from '../util/html-shortcuts'

export abstract class NoteQueryFetchDialog extends mixinWithFetchButton(NoteFetchDialog) {
	protected $closedInput=document.createElement('input')
	protected $closedSelect=document.createElement('select')
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void {
		{
			$fieldset.append(makeDiv('advanced-hint')(
				...this.makeLeadAdvancedHint()
			))
		}
		this.writeScopeAndOrderFieldsetQueryParameterHints($fieldset)
		this.writeScopeAndOrderFieldsetBeforeClosedLine($fieldset)
		{
			this.$closedInput.type='number'
			this.$closedInput.min='-1'
			this.$closedSelect.append(
				new Option(`both open and closed`,'-1'),
				new Option(`open and recently closed`,'7'),
				new Option(`only open`,'0'),
			)
			this.$closedInput.value=this.$closedSelect.value=this.defaultClosedValue
			const $closedLine=makeDiv('regular-input-group')(
				`Fetch `,
				makeElement('span')('non-advanced-input-group')(
					this.$closedSelect
				),
				` `,this.getClosedLineNotesText(),` `,
				makeLabel('advanced-input-group')(
					`closed no more than `,
					this.$closedInput,
					makeElement('span')('advanced-hint')(` (`,code('closed'),` parameter)`),
					` days ago`
				)
			)
			this.modifyClosedLine($closedLine)
			$fieldset.append($closedLine)
		}
	}
	private writeScopeAndOrderFieldsetQueryParameterHints($fieldset: HTMLFieldSetElement): void {
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
		const parameters=this.listParameters(closedDescriptionItems)
		if (parameters.length==0) return
		const $table=document.createElement('table')
		{
			const $row=$table.insertRow()
			$row.append(
				makeElement('th')()(`parameter`),
				makeElement('th')()(`description`)
			)
		}
		for (const [parameter,$input,descriptionItems] of parameters) {
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
	protected abstract makeLeadAdvancedHint(): Array<string|HTMLElement>
	protected listParameters(closedDescriptionItems: Array<string|HTMLElement>): [parameter: string, $input: HTMLElement, descriptionItems: Array<string|HTMLElement>][] { return [] }
	protected abstract writeScopeAndOrderFieldsetBeforeClosedLine($fieldset: HTMLFieldSetElement): void
	protected getClosedLineNotesText(): string {
		return `notes`
	}
	protected modifyClosedLine($div: HTMLElement): void {}
	protected addEventListeners(): void {
		this.addEventListenersBeforeClosedLine()
		this.$closedSelect.addEventListener('input',()=>{
			this.$closedInput.value=this.$closedSelect.value
			this.onClosedValueChange()
		})
		this.$closedInput.addEventListener('input',()=>{
			this.$closedSelect.value=String(restrictClosedSelectValue(Number(this.$closedInput.value)))
			this.onClosedValueChange()
		})
	}
	protected abstract addEventListenersBeforeClosedLine(): void
	protected onClosedValueChange(): void {}
	protected populateInputsWithoutUpdatingRequest(query: NoteQuery|undefined): void {
		this.populateInputsWithoutUpdatingRequestExceptForClosedInput(query)
		if (query && (query.mode=='search' || query.mode=='bbox' || query.mode=='browse')) {
			this.$closedInput.value=String(query.closed)
			this.$closedSelect.value=String(restrictClosedSelectValue(query.closed))
		} else {
			this.$closedInput.value=this.$closedSelect.value=this.defaultClosedValue
		}
	}
	protected get defaultClosedValue(): string {
		return '-1'
	}
	protected abstract populateInputsWithoutUpdatingRequestExceptForClosedInput(query: NoteQuery|undefined): void
	protected get closedValue(): string {
		return (this.$advancedModeCheckbox.checked
			? this.$closedInput.value
			: this.$closedSelect.value
		)
	}
	getQueryCaption(query: NoteQuery): HTMLTableCaptionElement {
		if (query.mode!='search' && query.mode!='bbox' && query.mode!='browse') return super.getQueryCaption(query)
		const items=this.getQueryCaptionItems(query)
		const $caption=makeElement('caption')()()
		if (query.closed==0) {
			$caption.append(`open notes`)
		} else if (query.closed==7) {
			$caption.append(`open and recently closed notes`)
		} else if (query.closed>0) {
			$caption.append(`open notes and notes closed up to ${query.closed} days ago`)
		} else {
			$caption.append(`notes`)
		}
		if (items.length>0) {
			$caption.append(` for `)
			let first=true
			for (const item of items) {
				if (first) {
					first=false
				} else {
					$caption.append(`, `)
				}
				$caption.append(...item)
			}
		}
		return $caption
	}
	protected abstract getQueryCaptionItems(query: NoteQuery): (string|HTMLElement)[][]
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
