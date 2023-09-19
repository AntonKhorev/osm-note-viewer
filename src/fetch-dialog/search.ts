import {NoteQueryFetchDialog, mixinWithAutoLoadCheckbox} from './base'
import type {NoteQuery} from '../query'
import {makeNoteSearchQueryFromValues, toUserQuery} from '../query'
import {toShortReadableDate} from '../query-date'
import DateInput from '../date-input'
import TextControl from '../text-control'
import {makeElement, makeLink, makeDiv, makeLabel} from '../util/html'
import {p,em,code} from '../util/html-shortcuts'

const rq=(param: string)=>makeElement('span')('advanced-hint')(` (`,code(param),` parameter)`)
const rq2=(param1: string, param2: string)=>makeElement('span')('advanced-hint')(` (`,code(param1),` or `,code(param2),` parameter)`)

export class NoteSearchFetchDialog extends mixinWithAutoLoadCheckbox(NoteQueryFetchDialog) {
	shortTitle=`Search`
	title=`Search notes for user / text / date range`
	protected $userInput=document.createElement('input')
	protected $textInput=document.createElement('input')
	protected fromDateInput=new DateInput()
	protected toDateInput=new DateInput()
	protected $sortSelect=document.createElement('select')
	protected $orderSelect=document.createElement('select')
	protected makeLeadAdvancedHint(): Array<string|HTMLElement> {
		return [p(
			`Make a `,makeLink(`search for notes`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Search_for_notes:_GET_/api/0.6/notes/search`),
			` request at `,code(this.cx.server.api.getUrl(`notes/search?`),em(`parameters`)),`; see `,em(`parameters`),` below.`
		)]
	}
	protected listParameters(closedDescriptionItems: Array<string|HTMLElement>): [parameter: string, $input: HTMLElement, descriptionItems: Array<string|HTMLElement>][] {
		return [
			['q',this.$textInput,[
				`Comment text search query. `,
				`Supplying it limits notes to the ones with comments containing the text. `,
				`This is not a substring search but rather a full-text search with English stemming rules. `,
				`It may not work correctly for other languages.`
			]],
			['limit',this.$limitInput,[
				`Max number of notes to fetch. `,
				`For `,em(`search`),` mode it corresponds to the size of one batch of notes since it's possible to load additional batches by pressing the `,em(`Load more`),` button below the note table. `,
				`This additional downloading is implemented by manipulating the requested date range.`
			]],
			['closed',this.$closedInput,closedDescriptionItems],
			['display_name',this.$userInput,[
				`Name of a user interacting with a note. `,
				`Both this parameter and the next one are optional. `,
				`Providing one of them limits the returned notes to those that were interacted by the given user. `,
				`This interaction is not limited to creating the note, closing/reopening/commenting also counts. `,
				`It makes no sense to provide both of these parameters because in this case `,code('user'),` is going to be ignored by the API, therefore `,em(`note-viewer`),`'s UI has only one input for both. `,
				`Whether `,code('display_name'),` or `,code('user'),` is passed to the API depends on the input value. `,
				`The `,code('display_name'),` parameter is passed if the input value contains `,code(`/`),` or doesn't start with `,code(`#`),`. `,
				`Value containing `,code(`/`),` is interpreted as a URL. `,
				`In case it's an OSM URL containing a username, this name is extracted and passed as `,code('display_name'),`. `,
				`Value starting with `,code(`#`),` is treated as a user id, see the next parameter. `,
				`Everything else is treated as a username.`
			]],
			['user',this.$userInput,[
				`Id of a user interacting with a note. `,
				`As stated above, the `,code('user'),` parameter is passed if the input value starts with `,code(`#`),`. `,
				`In this case the remaining part of the value is treated as a user id number. `,
				`Ids and URLs can be unambiguously detected in the input because usernames can't contain any of the following characters: `,code(`/;.,?%#`),`.`
			]],
			['from',this.fromDateInput.$input,[
				`Beginning of a date range. `,
				`This parameter is optional but if not provided the API will also ignore the `,code('to'),` parameter. `,
				em(`Note-viewer`),` makes `,code('from'),` actually optional by providing a value far enough in the past if `,code('to'),` value is entered while `,code('from'),` value is not. `,
				`Also both `,code('from'),` and `,code('to'),` parameters are altered in `,em(`Load more`),` fetches in order to limit the note selection to notes that are not yet downloaded.`
			]],
			['to',this.toDateInput.$input,[
				`End of a date range.`
			]],
			['sort',this.$sortSelect,[
				`Date to sort the notes. `,
				`This can be either a create date or an update date. `,
				`Sorting by update dates presents some technical difficulties which may lead to unexpected results if additional notes are loaded with `,em(`Load more`),`. `
			]],
			['order',this.$orderSelect,[
				`Sort order. `,
				`Ascending or descending.`
			]],
		]
	}
	protected writeScopeAndOrderFieldsetBeforeClosedLine($fieldset: HTMLFieldSetElement): void {
		{
			this.$userInput.type='text'
			this.$userInput.name='user'
			const userInputControl=new TextControl(
				this.$userInput,
				()=>this.cx.username!=null,
				()=>this.$userInput.value!=this.cx.username,
				()=>this.$userInput.value!=this.cx.username,
				(username)=>this.$userInput.value=username,
				async($a)=>{
					if (this.cx.username==null) throw new TypeError(`Undefined user when setting user search value`)
					const oldUsername=this.$userInput.value
					this.$userInput.value=this.cx.username
					return oldUsername
				},
				()=>[makeElement('span')()(`undo set to`)],
				()=>[makeElement('span')()(`set to`),` `,em(String(this.cx.username))]
			)
			$fieldset.append(makeDiv('major-input-group')(userInputControl.$controls,makeLabel()(
				`Username, URL or #id`,rq2('display_name','user'),` `,this.$userInput
			)))
			this.$root.addEventListener('osmNoteViewer:loginChange',()=>{
				userInputControl.update()
			})
		}{
			this.$textInput.type='text'
			this.$textInput.name='text'
			$fieldset.append(makeDiv('major-input-group')(makeLabel()(
				`Comment text search query`,rq('q'),` `,this.$textInput
			)))
		}{
			this.fromDateInput.$input.id='search-from-date'
			this.fromDateInput.$input.name='from'
			this.toDateInput.$input.id='search-to-date'
			this.toDateInput.$input.name='to'
			const $fromDateLabel=makeLabel('inline')(`From date`,rq('from'))
			$fromDateLabel.htmlFor='search-from-date'
			const $toDateLabel=makeLabel('inline')(`To date`,rq('to'))
			$toDateLabel.htmlFor='search-to-date'
			$fieldset.append(makeDiv('date-range-input-group')(
				makeElement('span')()(
					$fromDateLabel,` `,
					makeElement('span')()(...this.fromDateInput.$elements)
				),
				makeElement('span')()(
					$toDateLabel,` `,
					makeElement('span')()(...this.toDateInput.$elements)
				)
			))
		}
	}
	appendToClosedLine($div: HTMLElement): void {
		this.$sortSelect.append(
			new Option(`creation`,'created_at'),
			new Option(`last update`,'updated_at')
		)
		this.$orderSelect.append(
			new Option('newest'),
			new Option('oldest')
		)	
		$div.append(
			` `,
			makeLabel('inline')(`sorted by `,this.$sortSelect,rq('sort'),` date`),`, `,
			makeLabel('inline')(this.$orderSelect,rq('order'),` first`)
		)
	}
	protected limitValues=[20,100,500,2500]
	protected limitDefaultValue=20
	protected limitLeadText=`Download these `
	protected limitLabelBeforeText=`in batches of `
	protected limitLabelAfterText=` notes`
	protected limitIsParameter=true
	protected populateInputsWithoutUpdatingRequestExceptForClosedInput(query: NoteQuery | undefined): void {
		if (query && query.mode!='search') return
		if (query?.display_name) {
			this.$userInput.value=query.display_name
		} else if (query?.user) {
			this.$userInput.value='#'+query.user
		} else {
			this.$userInput.value=''
		}
		this.$userInput.dispatchEvent(new Event('input')) // update text controls
		this.$textInput.value=query?.q ?? ''
		this.fromDateInput.value=toShortReadableDate(query?.from)
		this.toDateInput.value=toShortReadableDate(query?.to)
		this.$sortSelect.value=query?.sort ?? 'created_at'
		this.$orderSelect.value=query?.order ?? 'newest'
	}
	protected addEventListenersBeforeClosedLine(): void {
		this.fromDateInput.onInput=this.toDateInput.onInput=()=>this.updateRequest()
		this.$userInput.addEventListener('input',()=>{
			const userQuery=toUserQuery(this.cx.server.api,this.cx.server.web,this.$userInput.value)
			if (userQuery.type=='invalid') {
				this.$userInput.setCustomValidity(userQuery.message)
			} else {
				this.$userInput.setCustomValidity('')
			}
		})
	}
	protected constructQuery(): NoteQuery | undefined {
		return makeNoteSearchQueryFromValues(
			this.cx.server.api,this.cx.server.web,
			this.$userInput.value,this.$textInput.value,this.fromDateInput.value,this.toDateInput.value,
			this.closedValue,this.$sortSelect.value,this.$orderSelect.value
		)
	}
	protected listQueryChangingInputs(): Array<HTMLInputElement|HTMLSelectElement> {
		return [
			this.$userInput,this.$textInput,
			// this.fromDateInput.$input,this.toDateInput.$input, // request updated in this class
			this.$closedInput,this.$closedSelect,this.$sortSelect,this.$orderSelect
		]
	}
	protected getQueryCaptionItems(query: NoteQuery) {
		if (query.mode!='search') return []
		const items: (string|HTMLElement)[][] = []
		if (query.display_name!=null) {
			items.push([`user `,this.makeInputLink(this.$userInput,query.display_name)])
		} else if (query.user!=null) {
			items.push([`user id `,this.makeInputLink(this.$userInput,String(query.user))])
		}
		if (query.q!=null) {
			items.push([`text `,this.makeInputLink(this.$textInput,query.q)])
		}
		if (query.from!=null && query.to!=null) {
			items.push([`dates `,
				this.makeInputLink(this.$textInput,toShortReadableDate(query.from)),`..`,
				this.makeInputLink(this.$textInput,toShortReadableDate(query.to))
			])
		} else {
			if (query.from!=null) {
				items.push([`dates starting at `,this.makeInputLink(this.$textInput,toShortReadableDate(query.from))])
			}
			if (query.to!=null) {
				items.push([`dates ending at `,this.makeInputLink(this.$textInput,toShortReadableDate(query.to))])
			}
		}
		return items
	}
}
