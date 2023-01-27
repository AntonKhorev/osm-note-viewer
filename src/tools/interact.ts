import {Tool, ToolElements, ToolCallbacks, makeNotesIcon, makeNoteStatusIcon} from './base'
import type {Note} from '../data'
import {readNoteResponse, NoteDataError} from '../fetch-note'
import {makeDiv, makeLink} from '../html'
import {makeEscapeTag} from '../escape'

const e=makeEscapeTag(encodeURIComponent)

class InteractionError extends TypeError {}

type InteractionDescription = {
	endpoint: string,
	label: string,
	$button: HTMLButtonElement,
	inputNoteIds: number[],
	inputNoteStatus: 'open'|'closed',
}

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
	private readonly selectedOpenNoteIds: number[] = []
	private readonly selectedClosedNoteIds: number[] = []
	private stashedSelectedNotes?: ReadonlyArray<Note>
	private isInteracting=false
	private interactionDescriptions: InteractionDescription[]=[{
		endpoint: 'comment',
		label: `Comment`,
		$button: this.$commentButton,
		inputNoteIds: this.selectedOpenNoteIds,
		inputNoteStatus: 'open',
	},{
		endpoint: 'close',
		label: `Close`,
		$button: this.$closeButton,
		inputNoteIds: this.selectedOpenNoteIds,
		inputNoteStatus: 'open',
	},{
		endpoint: 'reopen',
		label: `Reopen`,
		$button: this.$reopenButton,
		inputNoteIds: this.selectedClosedNoteIds,
		inputNoteStatus: 'closed',
	}]
	getTool(callbacks: ToolCallbacks): ToolElements {
		this.updateAsOutput()
		this.updateWithOutput()
		this.updateButtons()
		this.$commentText.oninput=()=>{
			this.updateButtons()
		}
		for (const {$button,inputNoteIds,endpoint} of this.interactionDescriptions) {
			$button.onclick=async()=>{
				this.clearButtonErrors()
				this.isInteracting=true
				try {
					while (inputNoteIds.length>0) {
						this.updateButtons()
						const id=inputNoteIds[0]
						const response=await this.auth.server.api.postUrlencoded(e`notes/${id}/${endpoint}.json`,{
							Authorization: 'Bearer '+this.auth.token
						},[
							['text',this.$commentText.value],
						])
						if (!response.ok) {
							throw new InteractionError(await response.text())
						}
						inputNoteIds.shift()
						const noteAndUsers=await readNoteResponse(id,response)
						callbacks.onNoteReload(this,...noteAndUsers)
					}
					this.$commentText.value=''
				} catch (ex) {
					$button.classList.add('error')
					if (ex instanceof InteractionError) {
						$button.title=ex.message
					} else if (ex instanceof NoteDataError) {
						$button.title=`Error after successful interaction: ${ex.message}`
					} else {
						$button.title=`Unknown error ${ex}`
					}
				}
				this.isInteracting=false
				if (this.stashedSelectedNotes) {
					const unstashedSelectedNotes=this.stashedSelectedNotes
					this.stashedSelectedNotes=undefined
					this.processSelectedNotes(unstashedSelectedNotes)
				}
				this.updateButtons()
			}
		}
		return [
			this.$asOutput,` `,this.$withOutput,` `,
			makeDiv('major-input')(this.$commentText),
			makeDiv('gridded-input')(...this.interactionDescriptions.map(({$button})=>$button))
		]
	}
	onLoginChange(): boolean {
		this.updateAsOutput()
		return true
	}
	onSelectedNotesChange(selectedNotes: ReadonlyArray<Note>) {
		if (this.isInteracting) {
			this.stashedSelectedNotes=selectedNotes
			return false
		}
		this.processSelectedNotes(selectedNotes)
		return true
	}
	private processSelectedNotes(selectedNotes: ReadonlyArray<Note>) {
		this.selectedOpenNoteIds.length=0
		this.selectedClosedNoteIds.length=0
		for (const selectedNote of selectedNotes) {
			if (selectedNote.status=='open') {
				this.selectedOpenNoteIds.push(selectedNote.id)
			} else if (selectedNote.status=='closed') {
				this.selectedClosedNoteIds.push(selectedNote.id)
			}
		}
		this.updateWithOutput()
		this.updateButtons()
		this.clearButtonErrors()
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
		for (const {$button,label,inputNoteIds,inputNoteStatus} of this.interactionDescriptions) {
			$button.disabled=this.isInteracting || inputNoteIds.length==0
			$button.replaceChildren(`${label} `,...buttonNoteIcon(inputNoteIds,inputNoteStatus))
		}
		if (this.$commentText.value=='') this.$commentButton.disabled=true
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
	private clearButtonErrors() {
		for (const {$button} of this.interactionDescriptions) {
			$button.classList.remove('error')
			$button.title=''
		}
	}
}
