import {NoteIdsFetchDialog, NoteFetchDialogSharedCheckboxes, mixinWithFetchButton} from './base'
import Server from '../server'
import NoteTable from '../table'
import {NoteQuery, makeNoteIdsQueryFromValue} from '../query'
import {makeDiv, makeLabel} from '../html'

export class NotePlaintextFetchDialog extends mixinWithFetchButton(NoteIdsFetchDialog) {
	shortTitle=`Plaintext`
	title=`Fetch notes by ids from unstructured text`
	protected $idsTextarea=document.createElement('textarea')
	private $copySelectedCheckbox=document.createElement('input')
	private $copyButton=document.createElement('button')
	constructor(
		$sharedCheckboxes: NoteFetchDialogSharedCheckboxes,
		server: Server,
		getRequestApiPaths: (query: NoteQuery, limit: number) => [type: string, apiPath: string][],
		submitQuery: (query: NoteQuery) => void,
		private noteTable: NoteTable
	) {
		super($sharedCheckboxes,server,getRequestApiPaths,submitQuery)
	}
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void {
		{
			this.$copySelectedCheckbox.type='checkbox'
			this.$copyButton.type='button'
			this.$copyButton.textContent=`Copy note ids from table below`
			$fieldset.append(makeDiv('checkbox-button-input')(
				this.$copySelectedCheckbox,' ',
				this.$copyButton
			))
		}{
			this.$idsTextarea.required=true
			this.$idsTextarea.rows=10
			$fieldset.append(makeDiv('major-input')(makeLabel()(
				`Note ids separated by anything: `,this.$idsTextarea
			)))
		}
	}
	protected addEventListeners(): void {
		const validateIds=()=>{
			const match=this.$idsTextarea.value.match(/\d+/)
			if (!match) {
				this.$idsTextarea.setCustomValidity(`should contain at least one number`)
			} else {
				this.$idsTextarea.setCustomValidity('')
			}
		}
		this.$idsTextarea.addEventListener('input',validateIds)
		this.$copySelectedCheckbox.addEventListener('input',()=>{
			this.$copyButton.textContent=`Copy${
				this.$copySelectedCheckbox.checked ? ' selected' : ''
			} note ids from table below`
		})
		this.$copyButton.addEventListener('click',()=>{
			const ids=(this.$copySelectedCheckbox.checked
				? this.noteTable.getSelectedNoteIds()
				: this.noteTable.getVisibleNoteIds()
			)
			this.$idsTextarea.value=ids.join()
			validateIds()
		})
	}
	protected populateInputsWithoutUpdatingRequest(query: NoteQuery | undefined): void {
		if (!query || query.mode!='ids') return
		this.$idsTextarea.value=query.ids.join()
	}
	protected constructQuery(): NoteQuery | undefined {
		return makeNoteIdsQueryFromValue(this.$idsTextarea.value)
	}
	protected listQueryChangingInputs() {
		return [this.$idsTextarea]
	}
}