import {NoteIdsFetchDialog, mixinWithFetchButton} from './base'
import {NoteQuery, NoteIdsQuery} from '../query'
import {makeDiv, makeLabel} from '../util'

export class NotePlaintextFetchDialog extends mixinWithFetchButton(NoteIdsFetchDialog) {
	shortTitle=`Plaintext`
	title=`Fetch notes by ids from unstructured text`
	protected $idsTextarea=document.createElement('textarea')
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void {
		{
			this.$idsTextarea.required=true
			this.$idsTextarea.rows=10
			$fieldset.append(makeDiv('major-input')(makeLabel()(
				`Note ids separated by anything: `,this.$idsTextarea
			)))
		}
	}
	protected addEventListeners(): void {
		// TODO listen to textarea changes, parse and validate
	}
	protected populateInputsWithoutUpdatingRequest(query: NoteQuery | undefined): void {
		// TODO update textarea from ids query - need to decide on formatting
	}
	protected constructQuery(): NoteQuery | undefined {
		return undefined // TODO make ids query
	}
	protected listQueryChangingInputs(): Array<HTMLInputElement|HTMLSelectElement> {
		return [] // TODO return textarea once query construction is on
	}
}
