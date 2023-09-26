import type {ParameterListItem, QueryCaptionItem} from './dynamic'
import DynamicNoteFetchDialog from './dynamic'
import type {NoteQuery} from '../query'
import {makeNoteBboxQueryFromValues} from '../query'
import {makeLink} from '../util/html'
import {p,em,code} from '../util/html-shortcuts'

export default class NoteBboxFetchDialog extends DynamicNoteFetchDialog {
	shortTitle=`BBox`
	title=`Get notes inside rectangular area`
	protected withBbox=true
	protected withBboxRequiredWhenPresent=true
	protected makeLeadAdvancedHint(): Array<string|HTMLElement> {
		return [p(
			`Make a `,makeLink(`notes in bounding box`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_notes_data_by_bounding_box:_GET_/api/0.6/notes`),
			` request at `,code(this.cx.server.api.getUrl(`notes?`),em(`parameters`)),`; see `,em(`parameters`),` below.`
		)]
	}
	protected listParameters(extraQueryParameters: ParameterListItem[], closedParameter: ParameterListItem): ParameterListItem[] {
		return [
			...extraQueryParameters,
			closedParameter,
			['limit',this.$limitInput,[
				`Max number of notes to fetch. `,
				`For `,em(`bbox`),` mode is corresponds to a total number of notes, not just a batch size. `,
				`It's impossible to download additional batches of notes because the API call used by this mode lacks date range parameters.`
			]],
		]
	}
	protected modifyClosedLine($div: HTMLElement): void {
		$div.append(
			` `,
			`sorted by last update date `,
			`newest first`
		)
	}
	protected limitValues=[20,100,500,2500,10000]
	protected limitDefaultValue=100 // higher default limit because no progressive loads possible
	protected limitLeadText=`Download `
	protected limitLabelBeforeText=`at most `
	protected limitLabelAfterText=` notes`
	protected limitIsParameter=true
	protected constructQuery(): NoteQuery | undefined {
		return makeNoteBboxQueryFromValues(
			this.$bboxInput?this.$bboxInput.value:'',this.closedValue
		)
	}
	protected listQueryChangingInputsWithoutBbox(): Array<HTMLInputElement|HTMLSelectElement> {
		return [
			this.$closedInput,this.$closedSelect
		]
	}
	protected getQueryCaptionItems(query: NoteQuery, extraQueryCaptionItems: QueryCaptionItem[]): QueryCaptionItem[] {
		if (query.mode!='bbox') return []
		return extraQueryCaptionItems
	}
}
