import {NoteIdsFetchDialog} from './ids'
import type {NoteQuery, NoteIdsQuery} from '../query'
import {makeElement, makeLink, makeDiv, makeLabel} from '../util/html'
import {em,p,ul,ol,li,kbd} from '../util/html-shortcuts'

export class NoteXmlFetchDialog extends NoteIdsFetchDialog {
	shortTitle=`XML`
	title=`Load an XML file containing note ids, then fetch them`
	private readonly $neisForm=document.createElement('form')
		private readonly $neisCountryInput=document.createElement('input')
		private readonly $neisStatusSelect=document.createElement('select')
	private readonly $neisFeedForm=document.createElement('form')
		private readonly $neisFeedCountryInput=document.createElement('input')
		private readonly $neisFeedStatusInput=document.createElement('input')
	private readonly $neisCustomForm=document.createElement('form')
		private readonly $neisCustomCountryInput=document.createElement('input')
		private readonly $neisCustomStatusInput=document.createElement('input')
	private readonly $neisButton=document.createElement('button')
	private readonly $issuesForm=document.createElement('form')
		private readonly $issuesStatusSelect=document.createElement('select')
		private readonly $issuesTypeInput=document.createElement('input')
	private readonly $issuesButton=document.createElement('button')
	protected $selectorInput=document.createElement('input')
	protected $attributeInput=document.createElement('input')
	protected $fileInput=document.createElement('input')
	protected writeExtraForms() {
		this.$neisFeedForm.action=`https://resultmaps.neis-one.org/osm-notes-country-feed`
		this.$neisFeedForm.target='_blank' // if browser chooses to navigate instead of download, open a new window; file download can't be forced without cooperation from server
		this.$neisFeedForm.append(
			hideInput(this.$neisFeedCountryInput,'c'),
			hideInput(this.$neisFeedStatusInput,'a')
		)
		this.$neisCustomForm.action=`https://resultmaps.neis-one.org/osm-notes-country-custom`
		this.$neisCustomForm.target='_blank'
		this.$neisCustomForm.append(
			hideInput(this.$neisCustomCountryInput,'c'),
			hideInput(this.$neisCustomStatusInput,'query')
		)
		this.$neisForm.id='neis-form'
		this.$issuesForm.id='issues-form'
		this.$issuesForm.action=this.cx.server.web.getUrl(`issues`)
		this.$issuesForm.target='_blank'
		this.$issuesForm.append(
			hideInput(this.$issuesTypeInput,'issue_type')
		)
		this.$issuesTypeInput.value='Note'
		this.$section.append(
			this.$neisForm,
			this.$neisFeedForm,this.$neisCustomForm, // fully hidden forms, need to be inserted into document anyway otherwise submit doesn't work
			this.$issuesForm
		)
		function hideInput($input: HTMLInputElement, name: string): HTMLInputElement {
			$input.name=name
			$input.type='hidden'
			return $input
		}
	}
	protected makeFetchControlDiv(): HTMLDivElement {
		this.$fileInput.name='xml'
		this.$fileInput.type='file'
		return makeDiv('major-input-group')(makeLabel('file-reader')(
			makeElement('span')('over')(`Read XML file`),` `,
			this.$fileInput
		))
	}
	disableFetchControl(disabled: boolean): void {
		this.$fileInput.disabled=disabled
	}
	protected listPrependedFieldsets() {
		const fieldsetList: (($fieldset:HTMLFieldSetElement,$legend:HTMLLegendElement)=>void)[] = []
		if (this.cx.server.host=='www.openstreetmap.org') {
			fieldsetList.push(
				($fieldset,$legend)=>this.writeNeisPrependedFieldset($fieldset,$legend)
			)
		}
		fieldsetList.push(
			($fieldset,$legend)=>this.writeIssuesPrependedFieldset($fieldset,$legend)
		)
		return fieldsetList
	}
	private writeNeisPrependedFieldset($fieldset: HTMLFieldSetElement, $legend: HTMLLegendElement): void {
		$legend.append(
			`Get notes in a country from `,
			em(`resultmaps.neis-one.org`)
		)
		{
			$fieldset.append(makeDiv()(makeElement('details')()(
				makeElement('summary')()(`How to get notes from `,em(`resultmaps.neis-one.org`)),
				ol(
					li(
						`Select a country and a note status, then click `,em(`Download feed file`),`. `,
						`After this one of the following things will happen, depending on your browser: `,
						ul(
							li(`The feed file is downloaded, which is what you want.`),
							li(`Browser opens a new tab with the feed file. In this case manually save the page.`)
						),
						`Also the `,em(`selector`),` and `,em(`attribute`),` fields below are updated to extract note ids from this feed.`
					),
					li(
						`Open the file with one of these two methods: `,
						ul(
							li(`Click the `,em(`Read XML file`),` area and use a file picker dialog.`),
							li(`Drag and drop the file from browser downloads panel/window into the `,em(`Read XML file`),` area. This is likely a faster method.`)
						)
					)
				),
				p(
					`Unfortunately these steps of downloading/opening a file cannot be avoided because `,makeLink(`neis-one.org`,`https://resultmaps.neis-one.org/osm-notes`),` server is not configured to let its data to be accessed by browser scripts.`
				)
			)))
		}{
			this.$neisCountryInput.type='text'
			this.$neisCountryInput.required=true
			this.$neisCountryInput.classList.add('no-invalid-indication') // because it's inside another form that doesn't require it, don't indicate that it's invalid
			this.$neisCountryInput.name='country'
			this.$neisCountryInput.setAttribute('form','neis-form')
			const $datalist=document.createElement('datalist')
			$datalist.id='neis-countries-list'
			$datalist.append(
				...neisCountries.map(c=>new Option(c))
			)
			this.$neisCountryInput.setAttribute('list','neis-countries-list')
			$fieldset.append(makeDiv('major-input-group')(makeLabel()(
				`Country `,this.$neisCountryInput,$datalist
			)))
		}{
			this.$neisStatusSelect.name='status'
			this.$neisStatusSelect.setAttribute('form','neis-form')
			this.$neisStatusSelect.append(
				...neisFeedStatuses.map(status=>new Option(`${status} (up to a week old)`,status)),
				new Option(`last updated 500`,'custom'),
				new Option(`last open 10000`,'custom-open'),
			)
			$fieldset.append(makeDiv('regular-input-group')(
				makeLabel()(
					`Get `,this.$neisStatusSelect,` notes`
				),` for this country`
			))
		}{
			this.$neisButton.textContent='Download feed file and populate XML fields below'
			this.$neisButton.setAttribute('form','neis-form')
			$fieldset.append(makeDiv('major-input-group')(
				this.$neisButton
			))
		}
	}
	private writeIssuesPrependedFieldset($fieldset: HTMLFieldSetElement, $legend: HTMLLegendElement): void {
		$legend.append(
			`Get reported notes from issues`
		)
		{
			$fieldset.append(makeDiv()(makeElement('details')()(
				makeElement('summary')()(`How to get reported notes from issues`),
				ol(
					p(
						`Issues pages are available to moderators. `,
						`This form is shown only if you're logged in with a moderator account. `,
						`The process of getting notes is similar to the one for `,em(`resultmaps.neis-one.org`),`, which is shown above if the default OSM server is selected. `
					),
					li(
						`Select the issue status and press the button. A corresponding issues page will be opened in a new tab.`
					),
					li(
						`Save the page (use `,kbd(`Ctrl+S`),` or `,em(`File`),` menu in the browser).`
					),
					li(
						`Drag and drop the file from browser downloads panel/window into the `,em(`Read XML file`),` area (or click the area and use a file picker).`
					)
				)
			)))
		}{
			this.$issuesStatusSelect.name='status'
			this.$issuesStatusSelect.setAttribute('form','issues-form')
			this.$issuesStatusSelect.append(
				new Option('open'),
				new Option('ignored'),
				new Option('resolved')
			)
			$fieldset.append(makeDiv('regular-input-group')(
				makeLabel()(
					`Get issues with status `,this.$issuesStatusSelect
				),` about notes`
			))
		}{
			this.$issuesButton.textContent='Go to issues page and populate XML fields below'
			this.$issuesButton.setAttribute('form','issues-form')
			$fieldset.append(makeDiv('major-input-group')(
				this.$issuesButton
			))
		}
		const updateFieldsetVisibility=()=>{
			$fieldset.hidden=!this.cx.isModerator
		}
		updateFieldsetVisibility()
		this.$root.addEventListener('osmNoteViewer:loginChange',()=>{
			updateFieldsetVisibility()
		})
	}
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement, $legend: HTMLLegendElement): void {
		$legend.textContent=`Read custom XML file`
		{
			$fieldset.append(makeDiv('advanced-hint')(p(
				`Load an arbitrary XML file containing note ids or links. `,
				`Elements containing the ids are selected by a `,makeLink(`css selector`,`https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors`),` provided below. `,
				`Inside the elements ids are looked for in an `,em(`attribute`),` if specified below, or in text content. `,
				`After that download each note `,makeLink(`by its id`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Read:_GET_/api/0.6/notes/#id`),`.`
			)))
		}{
			this.$selectorInput.type='text'
			this.$selectorInput.name='selector'
			this.$selectorInput.required=true
			$fieldset.append(makeDiv('major-input-group')(makeLabel()(
				`CSS selector matching XML elements with note ids `,this.$selectorInput
			)))
		}{
			this.$attributeInput.type='text'
			this.$attributeInput.name='attribute'
			$fieldset.append(makeDiv('major-input-group')(makeLabel()(
				`Attribute of matched XML elements containing note id (leave blank if note id is in text content) `,this.$attributeInput
			)))
		}
	}
	protected populateInputsWithoutUpdatingRequest(query: NoteQuery | undefined): void {
		return // TODO clear inputs
	}
	protected addEventListeners(): void {
		this.$neisForm.onsubmit=ev=>{
			ev.preventDefault()
			if (this.$neisStatusSelect.value=='custom' || this.$neisStatusSelect.value=='custom-open') {
				this.$selectorInput.value='td:nth-child(2)' // td:nth-child(2):not(:empty) - but empty values are skipped anyway
				this.$attributeInput.value=''
				this.$neisCustomCountryInput.value=this.$neisCountryInput.value
				this.$neisCustomStatusInput.value=this.$neisStatusSelect.value=='custom-open'?'open':''
				this.$neisCustomForm.submit()
			} else {
				this.$selectorInput.value='entry link'
				this.$attributeInput.value='href'
				this.$neisFeedCountryInput.value=this.$neisCountryInput.value
				this.$neisFeedStatusInput.value=this.$neisStatusSelect.value
				this.$neisFeedForm.submit()
			}
		}
		this.$issuesForm.onsubmit=ev=>{
			this.$selectorInput.value=`a[href^="${this.cx.server.web.getUrl('note/')}"]`
			this.$attributeInput.value=''
		}
		this.$selectorInput.addEventListener('input',()=>{
			const selector=this.$selectorInput.value
			try {
				document.createDocumentFragment().querySelector(selector) // https://stackoverflow.com/a/42149818
				this.$selectorInput.setCustomValidity('')
			} catch (ex) {
				this.$selectorInput.setCustomValidity(`has to be a valid css selector`)
			}
		})
		this.$fileInput.ondragenter=()=>{
			this.$fileInput.classList.add('active')
		}
		this.$fileInput.ondragleave=()=>{
			this.$fileInput.classList.remove('active')
		}
		this.$fileInput.addEventListener('change',()=>{
			this.$fileInput.classList.remove('active')
			if (!this.$form.reportValidity()) return // doesn't display validity message on drag&drop in Firefox, works ok in Chrome
			const files=this.$fileInput.files
			if (!files) return
			const [file]=files
			const fileType=(file.type=='text/html'?'text/html':'text/xml')
			const reader=new FileReader()
			reader.readAsText(file)
			reader.onload=()=>{
				if (typeof reader.result != 'string') return
				const parser=new DOMParser()
				const xmlDoc=parser.parseFromString(reader.result,fileType)
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
				this.submitQuery(query,true)
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
	getQueryCaption(query: NoteQuery): HTMLTableCaptionElement {
		return makeElement('caption')()(`notes from xml file `,this.makeInputLink(this.$fileInput,this.$fileInput.value))
	}
}

const neisFeedStatuses=[
	'opened',
	'commented',
	'reopened',
	'closed',
]

const neisCountries=[
	'Afghanistan',
	'Albania',
	'Algeria',
	'American Samoa',
	'Andorra',
	'Angola',
	'Anguilla',
	'Antarctica',
	'Antigua and Barbuda',
	'Argentina',
	'Armenia',
	'Aruba',
	'Australia',
	'Austria',
	'Azerbaijan',
	'Bahrain',
	'Baker Island',
	'Bangladesh',
	'Barbados',
	'Belarus',
	'Belgium',
	'Belize',
	'Benin',
	'Bermuda',
	'Bhutan',
	'Bolivia',
	'Bosnia and Herzegovina',
	'Botswana',
	'Bouvet Island',
	'Brazil',
	'British Indian Ocean Territory',
	'British Virgin Islands',
	'Brunei',
	'Bulgaria',
	'Burkina Faso',
	'Burundi',
	'Cambodia',
	'Cameroon',
	'Canada',
	'Cape Verde',
	'Caribbean Netherlands',
	'Cayman Islands',
	'Central African Republic',
	'Chad',
	'Chile',
	'China',
	'Christmas Island',
	'Cocos (Keeling) Islands',
	'Collectivity of Saint Martin',
	'Colombia',
	'Comoros',
	'Congo-Kinshasa',
	'Cook Islands',
	'Costa Rica',
	'Croatia',
	'Cuba',
	'Curaçao',
	'Cyprus',
	'Czech Republic',
	'Denmark',
	'Djibouti',
	'Dominica',
	'Dominican Republic',
	'East Timor',
	'Ecuador',
	'Egypt',
	'El Salvador',
	'Equatorial Guinea',
	'Eritrea',
	'Estonia',
	'Ethiopia',
	'Falkland Islands (Islas Malvinas)',
	'Faroe Islands',
	'Federated States of Micronesia',
	'Fiji',
	'Finland',
	'France',
	'French Guiana',
	'French Polynesia',
	'French Southern & Antarctic Lands',
	'Gabon',
	'Gaza Strip',
	'Georgia',
	'Germany',
	'Ghana',
	'Gibraltar',
	'Greece',
	'Greenland',
	'Grenada',
	'Guadeloupe',
	'Guam',
	'Guatemala',
	'Guernsey',
	'Guinea',
	'Guinea-Bissau',
	'Guyana',
	'Haiti',
	'Heard Island and McDonald Islands',
	'Honduras',
	'Hong Kong',
	'Howland Island',
	'Hungary',
	'Iceland',
	'India',
	'Indonesia',
	'Iran',
	'Iraq',
	'Ireland',
	'Isle of Man',
	'Israel',
	'Italy',
	'Ivory Coast',
	'Jamaica',
	'Jan Mayen',
	'Japan',
	'Jersey',
	'Johnston Atoll',
	'Jordan',
	'Kazakhstan',
	'Kenya',
	'Kiribati',
	'Kuwait',
	'Kyrgyzstan',
	'Laos',
	'Latvia',
	'Lebanon',
	'Lesotho',
	'Liberia',
	'Libya',
	'Liechtenstein',
	'Lithuania',
	'Luxembourg',
	'Macau',
	'Macedonia',
	'Madagascar',
	'Malawi',
	'Malaysia',
	'Maldives',
	'Mali',
	'Malta',
	'Marshall Islands',
	'Martinique',
	'Mauritania',
	'Mauritius',
	'Mayotte',
	'Mexico',
	'Moldova',
	'Monaco',
	'Mongolia',
	'Montenegro',
	'Montserrat',
	'Morocco',
	'Mozambique',
	'Myanmar (Burma)',
	'Namibia',
	'Nauru',
	'Nepal',
	'Netherlands',
	'New Caledonia',
	'New Zealand',
	'Nicaragua',
	'Niger',
	'Nigeria',
	'Niue',
	'Norfolk Island',
	'North Korea',
	'Northern Mariana Islands',
	'Norway',
	'Oman',
	'Pacific Islands (Palau)',
	'Pakistan',
	'Panama',
	'Papua New Guinea',
	'Paracel Islands',
	'Paraguay',
	'Peru',
	'Philippines',
	'Pitcairn Islands',
	'Poland',
	'Portugal',
	'Puerto Rico',
	'Qatar',
	'Republic of Kosovo',
	'Republic of the Congo',
	'Reunion',
	'Romania',
	'Russia',
	'Rwanda',
	'Saint Barthélemy',
	'Samoa',
	'San Marino',
	'Sao Tome and Principe',
	'Saudi Arabia',
	'Senegal',
	'Serbia',
	'Seychelles',
	'Sierra Leone',
	'Singapore',
	'Sint Maarten',
	'Slovakia',
	'Slovenia',
	'Solomon Islands',
	'Somalia',
	'South Africa',
	'South Georgia and the South Sandwich Islands',
	'South Korea',
	'South Sudan',
	'Spain',
	'Spratly Islands',
	'Sri Lanka',
	'St. Helena',
	'St. Kitts and Nevis',
	'St. Lucia',
	'St. Pierre and Miquelon',
	'St. Vincent and the Grenadines',
	'Sudan',
	'Suriname',
	'Svalbard',
	'Swaziland',
	'Sweden',
	'Switzerland',
	'Syria',
	'Taiwan',
	'Tajikistan',
	'Thailand',
	'The Bahamas',
	'The Gambia',
	'Togo',
	'Tonga',
	'Trinidad and Tobago',
	'Tunisia',
	'Turkey',
	'Turkmenistan',
	'Turks and Caicos Islands',
	'Tuvalu',
	'Uganda',
	'Ukraine',
	'United Arab Emirates',
	'United Kingdom',
	'United Republic of Tanzania',
	'United States',
	'United States Virgin Islands',
	'Uruguay',
	'Uzbekistan',
	'Vanuatu',
	'Vatican City',
	'Venezuela',
	'Vietnam',
	'Wake Island',
	'Wallis and Futuna',
	'West Bank',
	'Western Sahara',
	'Yemen',
	'Zambia',
	'Zimbabwe',
]
