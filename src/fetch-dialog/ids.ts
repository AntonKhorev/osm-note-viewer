import type {NoteFetchDialogSharedCheckboxes} from './base'
import StaticNoteFetchDialog from './static'
import type {Connection} from '../net'
import type NoteTable from '../table'
import type {NoteQuery} from '../query'
import {makeNoteIdsQueryFromValue} from '../query'
import {makeElement, makeDiv, makeLabel} from '../util/html'

export default class NoteIdsFetchDialog extends StaticNoteFetchDialog {
	shortTitle=`Ids`
	title=`Fetch notes by ids from unstructured text`
	protected $idsTextarea=document.createElement('textarea')
	private $copySelectedCheckbox=document.createElement('input')
	private $copyButton=document.createElement('button')
	constructor(
		$root: HTMLElement,
		$sharedCheckboxes: NoteFetchDialogSharedCheckboxes,
		cx: Connection,
		getRequestApiPaths: (query: NoteQuery, limit: number) => [type: string, apiPath: string][],
		submitQuery: (query: NoteQuery, isTriggeredBySubmitButton: boolean) => void,
		private noteTable: NoteTable
	) {
		super($root,$sharedCheckboxes,cx,getRequestApiPaths,submitQuery)
	}
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void {
		{
			this.$copySelectedCheckbox.type='checkbox'
			this.$copyButton.type='button'
			this.$copyButton.textContent=`Copy note ids from table below`
			$fieldset.append(makeDiv('input-group','checkbox-button')(
				this.$copySelectedCheckbox,' ',
				this.$copyButton
			))
		}{
			this.$idsTextarea.name='ids'
			this.$idsTextarea.required=true
			this.$idsTextarea.rows=10
			$fieldset.append(makeDiv('input-group','major')(makeLabel()(
				`Note ids separated by anything `,this.$idsTextarea
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
	getQueryCaption(query: NoteQuery): HTMLTableCaptionElement {
		const showSomeNotesThreshold=5
		const showAllNotesThreshold=7
		if (query.mode!='ids') return super.getQueryCaption(query)
		const prefix=query.ids.length==1 ? `note` : `notes`
		let ids: string
		if (query.ids.length<=showAllNotesThreshold) {
			ids=query.ids.join(`, `)
		} else {
			ids=query.ids.slice(0,showSomeNotesThreshold).join(`, `)+` and ${query.ids.length-showSomeNotesThreshold} other notes`
		}
		return makeElement('caption')()(prefix,` `,this.makeInputLink(this.$idsTextarea,ids))
	}
}
