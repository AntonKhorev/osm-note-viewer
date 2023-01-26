import {Tool, ToolElements, ToolCallbacks, makeNotesIcon} from './base'
import type {Note} from '../data'
import type Auth from '../auth'
import {makeDiv, wrapFetchForButton, makeGetKnownErrorMessage, makeLink} from '../html'
import {makeEscapeTag} from '../escape'

class NoteInteractionError extends TypeError {}

export class InteractTool extends Tool {
	id='interact'
	name=`Interact`
	title=`Interact with notes on OSM server`
	isFullWidth=true
	private auth?: Auth
	private $asOutput=document.createElement('output')
	private $withOutput=document.createElement('output')
	private $postButtons: HTMLButtonElement[] =[]
	private selectedOpenNoteIds: ReadonlyArray<number> = []
	private selectedClosedNoteIds: ReadonlyArray<number> = []
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>): boolean {
		const e=makeEscapeTag(encodeURIComponent)
		this.selectedOpenNoteIds=selectedNotes.filter(note=>note.status=='open').map(note=>note.id)
		this.selectedClosedNoteIds=selectedNotes.filter(note=>note.status=='closed').map(note=>note.id)
		if (selectedNotes.length==0) {
			this.$withOutput.replaceChildren(
				`with nothing`
			)
		} else if (selectedNotes.length==1) {
			if (this.auth) {
				const note=selectedNotes[0]
				const href=this.auth.server.web.getUrl(e`note/${note.id}`)
				const $a=makeLink(String(note.id),href)
				$a.classList.add('listened')
				$a.dataset.noteId=String(note.id)
				this.$withOutput.replaceChildren(
					`with `,$a
				)
			} else {
				this.$withOutput.replaceChildren(
					`with a note`
				)
			}
		} else {
			this.$withOutput.replaceChildren(
				`with notes` // TODO
			)
		}
		for (const $postButton of this.$postButtons) {
			$postButton.classList.remove('error')
			$postButton.title=''
		}
		return true
	}
	getTool(callbacks: ToolCallbacks, auth: Auth): ToolElements {
		this.auth=auth
		const e=makeEscapeTag(encodeURIComponent)
		if (auth.username==null || auth.uid==null) {
			this.$asOutput.replaceChildren(
				`anonymously`
			)
		} else {
			const href=auth.server.web.getUrl(e`user/${auth.username}`)
			const $a=makeLink(auth.username,href)
			$a.classList.add('listened')
			$a.dataset.userName=auth.username
			$a.dataset.userId=String(auth.uid)
			this.$asOutput.replaceChildren(
				`as `,$a
			)
		}
		this.$withOutput.replaceChildren(
			`with nothing`
		)
		const $commentText=document.createElement('textarea')
		const $commentButton=this.makeRequiringSelectedNotesButton(()=>!!$commentText.value)
		const $closeButton=this.makeRequiringSelectedNotesButton()
		const $reopenButton=this.makeRequiringSelectedNotesButton()
		this.$postButtons.push($commentButton,$closeButton,$reopenButton)
		$commentButton.append(`Comment `,makeNotesIcon('selected'))
		$closeButton.append(`Close `,makeNotesIcon('selected'))
		$reopenButton.append(`Reopen `,makeNotesIcon('selected'))
		$commentText.oninput=()=>{
			$commentButton.disabled=this.selectedOpenNoteIds.length==0 || !$commentText.value
		}
		const act=($button:HTMLButtonElement,endpoint:string,noteIds:ReadonlyArray<number>)=>wrapFetchForButton($button,async()=>{
			for (const id of noteIds) {
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
			await act($commentButton,'comment',this.selectedOpenNoteIds)
			$commentButton.disabled=!$commentText.value
		}
		$closeButton.onclick=async()=>{
			await act($commentButton,'close',this.selectedOpenNoteIds)
		}
		$reopenButton.onclick=async()=>{
			await act($reopenButton,'reopen',this.selectedClosedNoteIds)
		}
		return [
			this.$asOutput,` `,this.$withOutput,` `,
			makeDiv('major-input')($commentText),
			...this.$postButtons.map($postButton=>makeDiv('major-input')($postButton))
		]
	}
}
