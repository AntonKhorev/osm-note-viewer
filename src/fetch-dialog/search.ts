import {NoteQueryFetchDialog, mixinWithAutoLoadCheckbox} from './base'
import {NoteQuery, makeNoteSearchQueryFromValues} from '../query'
import {toUserQuery} from '../query-user'
import {toDateQuery, toReadableDate} from '../query-date'
import {makeElement, makeLink, makeDiv, makeLabel} from '../util'

const em=(...ss: Array<string|HTMLElement>)=>makeElement('em')()(...ss)
const code=(...ss: Array<string|HTMLElement>)=>makeElement('code')()(...ss)
const rq=(param: string)=>makeElement('span')('advanced-hint')(` (`,code(param),` parameter)`)
const rq2=(param1: string, param2: string)=>makeElement('span')('advanced-hint')(` (`,code(param1),` or `,code(param2),` parameter)`)

export class NoteSearchFetchDialog extends mixinWithAutoLoadCheckbox(NoteQueryFetchDialog) {
	shortTitle=`Search`
	title=`Search notes for user / text / date range`
	protected $userInput=document.createElement('input')
	protected $textInput=document.createElement('input')
	protected $fromInput=document.createElement('input')
	protected $toInput=document.createElement('input')
	protected $sortSelect=document.createElement('select')
	protected $orderSelect=document.createElement('select')
	protected writeScopeAndOrderFieldsetBeforeClosedLine($fieldset: HTMLFieldSetElement): void {
		{
			$fieldset.append(makeDiv('advanced-hint')(
				`Make a `,makeLink(`search for notes`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Search_for_notes:_GET_/api/0.6/notes/search`),
				` request at `,code(`https://api.openstreetmap.org/api/0.6/notes/search?`,em(`parameters`)),`; see `,em(`parameters`),` below.`
			))
		}{
			this.$userInput.type='text'
			this.$userInput.name='user'
			$fieldset.append(makeDiv('major-input')(makeLabel()(
				`OSM username, URL or #id`,rq2('display_name','user'),`: `,this.$userInput
			)))
		}{
			$fieldset.append(makeDiv('advanced-hint')(
				`If the value of the input above starts with `,code(`#`),`, its remaining part is treated as a user id which is passed to the API as the `,code('user'),` parameter. `,
				`The value containing `,code(`/`),` is treated as a URL, if it's an OSM URL with a username in it this name is passed as the `,code('display_name'),` parameter. `,
				`Other nonempty values are treated as usernames and also passed as `,code('display_name'),`. `,
				`Ids and URLs can be unambiguously detected because usernames can't contain any of the following characters: `,code(`/;.,?%#`),`.`
			))
		}{
			this.$textInput.type='text'
			this.$textInput.name='text'
			$fieldset.append(makeDiv('major-input')(makeLabel()(
				`Comment text search query`,rq('q'),`: `,this.$textInput
			)))
		}{
			this.$fromInput.type='text'
			this.$fromInput.size=20
			this.$fromInput.name='from'
			this.$toInput.type='text'
			this.$toInput.size=20
			this.$toInput.name='to'
			$fieldset.append(makeDiv()(
				`Date range: `,
				makeLabel()(`from`,rq('from'),` `,this.$fromInput),` `,
				makeLabel()(`to`,rq('to'),` `,this.$toInput)
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
	protected writeDownloadModeFieldset($fieldset: HTMLFieldSetElement): void {
		{
			this.$autoLoadCheckbox.type='checkbox'
			this.$autoLoadCheckbox.checked=true
			$fieldset.append(makeDiv()(makeLabel()(
				this.$autoLoadCheckbox,` Automatically load more notes when scrolled to the end of the table`
			)))
		}
	}
	protected populateInputsWithoutUpdatingRequestExceptForClosedInput(query: NoteQuery | undefined): void {
		if (query && query.mode!='search') return
		if (query?.display_name) {
			this.$userInput.value=query.display_name
		} else if (query?.user) {
			this.$userInput.value='#'+query.user
		} else {
			this.$userInput.value=''
		}
		this.$textInput.value=query?.q ?? ''
		this.$fromInput.value=toReadableDate(query?.from)
		this.$toInput.value=toReadableDate(query?.to)
		this.$sortSelect.value=query?.sort ?? 'created_at'
		this.$orderSelect.value=query?.order ?? 'newest'
	}
	protected addEventListenersBeforeClosedLine(): void {
		this.$userInput.addEventListener('input',()=>{
			const userQuery=toUserQuery(this.$userInput.value)
			if (userQuery.userType=='invalid') {
				this.$userInput.setCustomValidity(userQuery.message)
			} else {
				this.$userInput.setCustomValidity('')
			}
		})
		for (const $input of [this.$fromInput,this.$toInput]) $input.addEventListener('input',()=>{
			const query=toDateQuery($input.value)
			if (query.dateType=='invalid') {
				$input.setCustomValidity(query.message)
			} else {
				$input.setCustomValidity('')
			}
		})
	}
	protected constructQuery(): NoteQuery | undefined {
		return makeNoteSearchQueryFromValues(
			this.$userInput.value,this.$textInput.value,this.$fromInput.value,this.$toInput.value,
			this.closedValue,this.$sortSelect.value,this.$orderSelect.value
		)
	}
	protected listQueryChangingInputs(): Array<HTMLInputElement|HTMLSelectElement> {
		return [
			this.$userInput,this.$textInput,this.$fromInput,this.$toInput,
			this.$closedInput,this.$closedSelect,this.$sortSelect,this.$orderSelect
		]
	}
}
