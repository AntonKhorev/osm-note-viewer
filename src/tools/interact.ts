import {Tool, ToolElements, ToolCallbacks, makeNotesIcon, makeNoteStatusIcon} from './base'
import type {Note} from '../data'
import {makeDiv, wrapFetchForButton, makeGetKnownErrorMessage, makeLink} from '../html'
import {makeEscapeTag} from '../escape'

const e=makeEscapeTag(encodeURIComponent)

class NoteInteractionError extends TypeError {}

export class InteractTool extends Tool {
	id='interact'
	name=`Interact`
	title=`Interact with notes on OSM server`
	isFullWidth=true
	private $asOutput=document.createElement('output')
	private $withOutput=document.createElement('output')
	private $commentText=document.createElement('textarea')
	private $commentButton=document.createElement('button')
	private $closeButton=document.createElement('button')
	private $reopenButton=document.createElement('button')
	private $postButtons: HTMLButtonElement[] = [this.$commentButton,this.$closeButton,this.$reopenButton]
	private selectedOpenNoteIds: ReadonlyArray<number> = []
	private selectedClosedNoteIds: ReadonlyArray<number> = []
	getTool(callbacks: ToolCallbacks): ToolElements {
		this.updateAsOutput()
		this.updateWithOutput()
		this.updateButtons()
		this.$commentText.oninput=()=>{
			this.$commentButton.disabled=this.selectedOpenNoteIds.length==0 || !this.$commentText.value
		}
		const act=($button:HTMLButtonElement,endpoint:string,noteIds:ReadonlyArray<number>)=>wrapFetchForButton($button,async()=>{
			for (const id of noteIds) {
				const response=await this.auth.server.api.postUrlencoded(e`notes/${id}/${endpoint}`,{
					Authorization: 'Bearer '+this.auth.token
				},[
					['text',this.$commentText.value],
				])
				if (!response.ok) {
					throw new NoteInteractionError(await response.text())
				}
			}
			this.$commentText.value=''
		},makeGetKnownErrorMessage(NoteInteractionError))
		this.$commentButton.onclick=async()=>{
			await act(this.$commentButton,'comment',this.selectedOpenNoteIds)
			this.$commentButton.disabled=!this.$commentText.value
		}
		this.$closeButton.onclick=async()=>{
			await act(this.$closeButton,'close',this.selectedOpenNoteIds)
		}
		this.$reopenButton.onclick=async()=>{
			await act(this.$reopenButton,'reopen',this.selectedClosedNoteIds)
		}
		return [
			this.$asOutput,` `,this.$withOutput,` `,
			makeDiv('major-input')(this.$commentText),
			makeDiv('gridded-input')(...this.$postButtons)
		]
	}
	onLoginChange(): boolean {
		this.updateAsOutput()
		return true
	}
	onSelectedNotesChange(selectedNotes: ReadonlyArray<Note>) {
		this.selectedOpenNoteIds=selectedNotes.filter(note=>note.status=='open').map(note=>note.id)
		this.selectedClosedNoteIds=selectedNotes.filter(note=>note.status=='closed').map(note=>note.id)
		this.updateWithOutput()
		this.updateButtons()
		return true
	}
	private updateAsOutput() {
		if (this.auth.username==null || this.auth.uid==null) {
			this.$asOutput.replaceChildren(
				`anonymously`
			)
		} else {
			const href=this.auth.server.web.getUrl(e`user/${this.auth.username}`)
			const $a=makeLink(this.auth.username,href)
			$a.classList.add('listened')
			$a.dataset.userName=this.auth.username
			$a.dataset.userId=String(this.auth.uid)
			this.$asOutput.replaceChildren(
				`as `,$a
			)
		}
	}
	private updateWithOutput() {
		let first=true
		const writeSingleNote=(id:number,status:'open'|'closed')=>{
			if (!first) this.$withOutput.append(`, `)
			first=false
			const href=this.auth.server.web.getUrl(e`note/${id}`)
			const $a=document.createElement('a')
			$a.href=href
			$a.classList.add('listened')
			$a.dataset.noteId=String(id)
			$a.append(makeNoteStatusIcon(status),` ${id}`)
			this.$withOutput.append($a)
		}
		const writeOneOrManyNotes=(ids:readonly number[],status:'open'|'closed')=>{
			if (ids.length==0) {
				return
			}
			if (ids.length==1) {
				writeSingleNote(ids[0],status)
				return
			}
			if (!first) this.$withOutput.append(`, `)
			first=false
			this.$withOutput.append(`${ids.length} × `,makeNoteStatusIcon(status,ids.length))
		}
		const nSelectedNotes=this.selectedOpenNoteIds.length+this.selectedClosedNoteIds.length
		if (nSelectedNotes==0) {
			this.$withOutput.replaceChildren(`with nothing`)
		} else if (nSelectedNotes<=5) {
			this.$withOutput.replaceChildren(`with `)
			for (const noteId of this.selectedOpenNoteIds) {
				writeSingleNote(noteId,'open')
			}
			for (const noteId of this.selectedClosedNoteIds) {
				writeSingleNote(noteId,'closed')
			}
		} else {
			this.$withOutput.replaceChildren(`with `)
			writeOneOrManyNotes(this.selectedOpenNoteIds,'open')
			writeOneOrManyNotes(this.selectedClosedNoteIds,'closed')
		}
	}
	private updateButtons() {
		for (const $postButton of this.$postButtons) {
			$postButton.classList.remove('error')
			$postButton.title=''
		}
		this.$commentButton.disabled=this.selectedOpenNoteIds.length==0 || this.$commentText.value==''
		this.$closeButton.disabled=this.selectedOpenNoteIds.length==0
		this.$reopenButton.disabled=this.selectedClosedNoteIds.length==0
		this.$commentButton.replaceChildren(`Comment `,...buttonNoteIcon(this.selectedOpenNoteIds,'open'))
		this.$closeButton.replaceChildren(`Close `,...buttonNoteIcon(this.selectedOpenNoteIds,'open'))
		this.$reopenButton.replaceChildren(`Reopen `,...buttonNoteIcon(this.selectedClosedNoteIds,'closed'))
		function buttonNoteIcon(ids:readonly number[],status:'open'|'closed'): (string|HTMLElement)[] {
			if (ids.length==0) {
				return [makeNotesIcon('selected')]
			} else if (ids.length==1) {
				return [makeNoteStatusIcon(status),` ${ids[0]}`]
			} else {
				return [`${ids.length} × `,makeNoteStatusIcon(status,ids.length)]
			}
		}
	}
}
