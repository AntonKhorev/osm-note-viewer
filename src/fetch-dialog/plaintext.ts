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
		this.$idsTextarea.addEventListener('input',()=>{
			const match=this.$idsTextarea.value.match(/\d+/)
			if (!match) {
				this.$idsTextarea.setCustomValidity(`should contain at least one number`)
			} else {
				this.$idsTextarea.setCustomValidity('')
			}
		})
	}
	protected populateInputsWithoutUpdatingRequest(query: NoteQuery | undefined): void {
		if (!query || query.mode!='ids') return
		this.$idsTextarea.value=query.ids.join()
	}
	protected constructQuery(): NoteQuery | undefined {
		const ids: number[] = []
		for (const idString of this.$idsTextarea.value.matchAll(/\d+/g)) {
			ids.push(Number(idString))
		}
		return {
			mode: 'ids',
			ids
		}
	}
	protected listQueryChangingInputs() {
		return [this.$idsTextarea]
	}
}
