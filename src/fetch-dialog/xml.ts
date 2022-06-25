import {NoteFetchDialog} from './base'
import {NoteQuery, NoteIdsQuery} from '../query'
import {makeElement, makeLink, makeDiv, makeLabel} from '../util'

const em=(...ss: Array<string|HTMLElement>)=>makeElement('em')()(...ss)
const code=(...ss: Array<string|HTMLElement>)=>makeElement('code')()(...ss)

export class NoteXmlFetchDialog extends NoteFetchDialog {
	title=`Load an xml file containing note ids, then fetch them`
	private $neisForm=document.createElement('form')
	private $neisCountryInput=document.createElement('input')
	private $neisStatusSelect=document.createElement('select')
	private $neisButton=document.createElement('button')
	protected $selectorInput=document.createElement('input')
	protected $attributeInput=document.createElement('input')
	protected $fileInput=document.createElement('input')
	$autoLoadCheckbox=document.createElement('input')
	$fetchFileInput=document.createElement('input')
	protected writeExtraForms() {
		this.$neisForm.id='neis-form'
		this.$neisForm.action=`https://resultmaps.neis-one.org/osm-notes-country-feed`
		this.$details.append(this.$neisForm)
	}
	protected makeFetchControlDiv(): HTMLDivElement {
		this.$fetchFileInput.type='file'
		return makeDiv('major-input')(makeLabel('file-reader')(
			makeElement('span')('over')(`Read XML file`),
			makeElement('span')('colon')(`:`),` `,
			this.$fetchFileInput
		))
	}
	protected writePrependedFieldset($fieldset: HTMLFieldSetElement, $legend: HTMLLegendElement): void {
		$legend.textContent=`Get note feed from resultmaps.neis-one.org`
		{
			this.$neisCountryInput.type='text'
			this.$neisCountryInput.required=true
			this.$neisCountryInput.classList.add('no-invalid-indication') // because it's inside another form that doesn't require it, don't indicate that it's invalid
			this.$neisCountryInput.name='c'
			this.$neisCountryInput.setAttribute('form','neis-form')
			$fieldset.append(makeDiv('major-input')(makeLabel()(
				`Country: `,this.$neisCountryInput
			)))
		}{
			this.$neisStatusSelect.name='a'
			this.$neisStatusSelect.setAttribute('form','neis-form')
			this.$neisStatusSelect.append(
				new Option('opened'),
				new Option('commented'),
				new Option('reopened'),
				new Option('closed')
			)
			$fieldset.append(makeDiv()(
				`Get `,makeLabel()(
					`feed of `,this.$neisStatusSelect,` notes`
				),` for this country`
			))
		}{
			this.$neisButton.textContent='Download feed file and populate XML fields below'
			this.$neisButton.setAttribute('form','neis-form')
			$fieldset.append(makeDiv('major-input')(
				this.$neisButton
			))
		}
	}
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement, $legend: HTMLLegendElement): void {
		$legend.textContent=`Or read custom XML file`
		{
			$fieldset.append(makeDiv('request')(
				`Load an arbitrary XML file containing note ids or links. `,
				`Elements containing the ids are selected by a `,makeLink(`css selector`,`https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors`),` provided below. `,
				`Inside the elements ids are looked for in an `,em(`attribute`),` if specified below, or in text content. `,
				`After that download each note `,makeLink(`by its id`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Read:_GET_/api/0.6/notes/#id`),`.`
			))
		}{
			this.$selectorInput.type='text'
			this.$selectorInput.name='selector'
			this.$selectorInput.required=true
			$fieldset.append(makeDiv('major-input')(makeLabel()(
				`CSS selector matching XML elements with note ids: `,this.$selectorInput
			)))
		}{
			this.$attributeInput.type='text'
			this.$attributeInput.name='attribute'
			$fieldset.append(makeDiv('major-input')(makeLabel()(
				`Attribute of matched XML elements containing note id (leave blank if note id is in text content): `,this.$attributeInput
			)))
		}
	}
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
	protected populateInputsWithoutUpdatingRequest(query: NoteQuery | undefined): void {
		return // query not stored
	}
	protected addEventListeners(): void {
		this.$neisForm.addEventListener('submit',()=>{
			this.$selectorInput.value='entry link'
			this.$attributeInput.value='href'
		})
		this.$selectorInput.addEventListener('input',()=>{
			const selector=this.$selectorInput.value
			try {
				document.createDocumentFragment().querySelector(selector) // https://stackoverflow.com/a/42149818
				this.$selectorInput.setCustomValidity('')
			} catch (ex) {
				this.$selectorInput.setCustomValidity(`has to be a valid css selector`)
			}
		})
		this.$fetchFileInput.ondragenter=()=>{
			this.$fetchFileInput.classList.add('active')
		}
		this.$fetchFileInput.ondragleave=()=>{
			this.$fetchFileInput.classList.remove('active')
		}
		this.$fetchFileInput.addEventListener('change',()=>{
			this.$fetchFileInput.classList.remove('active')
			if (!this.$form.reportValidity()) return // doesn't display validity message on drag&drop in Firefox, works ok in Chrome
			const files=this.$fetchFileInput.files
			if (!files) return
			const [file]=files
			const reader=new FileReader()
			reader.readAsText(file)
			reader.onload=()=>{
				if (typeof reader.result != 'string') return
				const parser=new DOMParser()
				const xmlDoc=parser.parseFromString(reader.result,'text/xml')
				const selector=this.$selectorInput.value
				const attribute=this.$attributeInput.value
				const $elements=xmlDoc.querySelectorAll(selector)
				const ids: number[] = []
				for (const $element of $elements) {
					const value=getValue($element,attribute)
					if (!value) continue
					const match=value.match(/([0-9]+)[^0-9]*$/)
					if (!match) continue
					const [idString]=match
					ids.push(Number(idString))
				}
				const query: NoteIdsQuery = {
					mode: 'ids',
					ids
				}
				this.submitQuery(query)
			}
		})
		function getValue($element: Element, attribute: string) {
			if (attribute=='') {
				return $element.textContent
			} else {
				return $element.getAttribute(attribute)
			}
		}
	}
	protected constructQuery(): NoteQuery | undefined {
		return undefined
	}
	protected listQueryChangingInputs(): Array<HTMLInputElement|HTMLSelectElement> {
		return []
	}
}
