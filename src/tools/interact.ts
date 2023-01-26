import {Tool, ToolElements, ToolCallbacks, makeNotesIcon} from './base'
import type {Note} from '../data'
import type Auth from '../auth'
import {makeDiv, wrapFetchForButton, makeGetKnownErrorMessage} from '../html'
import {makeEscapeTag} from '../escape'

class NoteInteractionError extends TypeError {}

export class InteractTool extends Tool {
	private $postButtons: HTMLButtonElement[] =[]
	private selectedNoteIds: ReadonlyArray<number> = [] // TODO also save open/closed status
	constructor() {super(
		'interact',
		`Interact`,
		`Interact with notes on OSM server`,
		true
	)}
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>): boolean {
		this.selectedNoteIds=selectedNotes.map(note=>note.id)
		for (const $postButton of this.$postButtons) {
			$postButton.classList.remove('error')
			$postButton.title=''
		}
		return true
	}
	getTool(callbacks: ToolCallbacks, auth: Auth): ToolElements {
		const e=makeEscapeTag(encodeURIComponent)
		const $commentText=document.createElement('textarea')
		const $commentButton=this.makeRequiringSelectedNotesButton(()=>!!$commentText.value)
		const $closeButton=this.makeRequiringSelectedNotesButton()
		const $reopenButton=this.makeRequiringSelectedNotesButton()
		this.$postButtons.push($commentButton,$closeButton,$reopenButton)
		$commentButton.append(`Comment `,makeNotesIcon('selected'))
		$closeButton.append(`Close `,makeNotesIcon('selected'))
		$reopenButton.append(`Reopen `,makeNotesIcon('selected'))
		$commentText.oninput=()=>{
			$commentButton.disabled=this.selectedNoteIds.length==0 || !$commentText.value
		}
		const act=($button:HTMLButtonElement,endpoint:string)=>wrapFetchForButton($button,async()=>{
			for (const id of this.selectedNoteIds) {
				const response=await auth.server.api.postUrlencoded(e`notes/${id}/${endpoint}`,{
					Authorization: 'Bearer '+auth.token
				},[
					['text',$commentText.value],
				])
				if (!response.ok) {
					throw new NoteInteractionError(await response.text())
				}
			}
			$commentText.value=''
		},makeGetKnownErrorMessage(NoteInteractionError))
		$commentButton.onclick=async()=>{
			await act($commentButton,'comment')
			$commentButton.disabled=!$commentText.value
		}
		$closeButton.onclick=async()=>{
			await act($commentButton,'close')
		}
		$reopenButton.onclick=async()=>{
			await act($reopenButton,'reopen')
		}
		return [
			makeDiv('major-input')($commentText),
			...this.$postButtons.map($postButton=>makeDiv('major-input')($postButton))
		]
	}
}
