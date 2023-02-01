import {Tool, ToolElements, ToolCallbacks, makeNotesIcon, makeNoteStatusIcon, makeActionIcon} from './base'
import type Auth from '../auth'
import type {Note} from '../data'
import {noteStatuses} from '../data'
import {readNoteResponse, NoteDataError} from '../fetch-note'
import {makeHrefWithCurrentHost} from '../hash'
import {makeElement, makeDiv, makeLink} from '../html'
import {p,ul,li,code} from '../html-shortcuts'
import {makeEscapeTag} from '../escape'

const e=makeEscapeTag(encodeURIComponent)

class InteractionError extends TypeError {}

type InteractionDescription = ({
	verb: 'POST'
	endpoint: string
} | {
	verb: 'DELETE'
}) & {
	label: string
	runningLabel: string
	$button: HTMLButtonElement
	inputNoteStatus: Note['status']
	outputNoteStatus: Note['status']
	forModerator: boolean
}

type InteractionRun = {
	interactionDescription: InteractionDescription
	status: 'running' | 'paused' | 'finished'
	requestedStatus: 'running' | 'paused'
	inputNoteIds: number[]
	outputNoteIds: number[]
}

export class InteractTool extends Tool {
	id='interact'
	name=`Interact`
	title=`Interact with notes on OSM server`
	isFullWidth=true
	private $yourNotesApi=document.createElement('span')
	private $yourNotesWeb=document.createElement('span')
	private $asOutput=document.createElement('output')
	private $withOutput=document.createElement('output')
	private $commentText=document.createElement('textarea')
	private $commentButton=document.createElement('button')
	private $closeButton=document.createElement('button')
	private $reopenButton=document.createElement('button')
	private $hideOpenButton=document.createElement('button')
	private $hideClosedButton=document.createElement('button')
	private $reactivateButton=document.createElement('button')
	private $runButton=makeElement('button')('only-with-icon')()
	private $runOutput=document.createElement('output')
	private readonly selectedNoteIds: Map<Note['status'],number[]> = new Map(noteStatuses.map(status=>[status,[]]))
	private run?: InteractionRun
	private interactionDescriptions: InteractionDescription[]=[{
		verb: 'POST',
		endpoint: 'comment',
		label: `Comment`,
		runningLabel: `Commenting`,
		$button: this.$commentButton,
		inputNoteStatus: 'open',
		outputNoteStatus: 'open',
		forModerator: false
	},{
		verb: 'POST',
		endpoint: 'close',
		label: `Close`,
		runningLabel: `Closing`,
		$button: this.$closeButton,
		inputNoteStatus: 'open',
		outputNoteStatus: 'closed',
		forModerator: false
	},{
		verb: 'POST',
		endpoint: 'reopen',
		label: `Reopen`,
		runningLabel: `Reopening`,
		$button: this.$reopenButton,
		inputNoteStatus: 'closed',
		outputNoteStatus: 'open',
		forModerator: false
	},{
		verb: 'DELETE',
		label: `Hide`,
		runningLabel: `Hiding`,
		$button: this.$hideOpenButton,
		inputNoteStatus: 'open',
		outputNoteStatus: 'hidden',
		forModerator: true
	},{
		verb: 'DELETE',
		label: `Hide`,
		runningLabel: `Hiding`,
		$button: this.$hideClosedButton,
		inputNoteStatus: 'closed',
		outputNoteStatus: 'hidden',
		forModerator: true
	},{
		verb: 'POST',
		endpoint: 'reopen',
		label: `Reactivate`,
		runningLabel: `Reactivating`,
		$button: this.$reactivateButton,
		inputNoteStatus: 'hidden',
		outputNoteStatus: 'open',
		forModerator: true
	}]
	constructor(auth: Auth) {
		super(auth)
		this.updateYourNotes()
		this.updateAsOutput()
		this.updateWithOutput()
		this.$commentText.placeholder=`Comment text`
		this.updateButtons()
		this.updateRun()
	}
	getInfo() {return[p(
		`Do the following operations with notes:`
	),ul(
		li(
			makeLink(`comment`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Create_a_new_comment:_Create:_POST_/api/0.6/notes/#id/comment`)
		),li(
			makeLink(`close`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Close:_POST_/api/0.6/notes/#id/close`)
		),li(
			makeLink(`reopen`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Reopen:_POST_/api/0.6/notes/#id/reopen`),
			` — for moderators this API call also makes hidden note visible again`
		),li(
			`for moderators there's also a delete method to hide a note: `,code(`DELETE /api/0.6/notes/#id`)
		)
	),p(
		`If you want to find the notes you interacted with, try searching for `,this.$yourNotesApi,`. `,
		`Unfortunately searching using the API doesn't reveal hidden notes even to moderators. `,
		`If you've hidden a note and want to see it, look for it at `,this.$yourNotesWeb,` on the OSM website.`
	)]}
	getTool(callbacks: ToolCallbacks): ToolElements {
		this.$commentText.oninput=()=>{
			this.updateButtons()
		}
		const scheduleRunNextNote=this.makeRunScheduler(callbacks)
		for (const interactionDescription of this.interactionDescriptions) {
			interactionDescription.$button.onclick=async()=>{
				if (this.run?.status=='paused') {
					this.run=undefined
					this.updateButtons()
					this.updateRun()
				} else {
					const matchingNoteIds=this.selectedNoteIds.get(interactionDescription.inputNoteStatus)
					if (!matchingNoteIds) return
					const runImmediately=matchingNoteIds.length<=1
					this.run={
						interactionDescription,
						status: 'paused',
						requestedStatus: runImmediately?'running':'paused',
						inputNoteIds: [...matchingNoteIds],
						outputNoteIds: []
					}
					if (runImmediately) scheduleRunNextNote()
					this.updateButtons()
					this.updateRun()
				}
			}
		}
		this.$runButton.onclick=async()=>{
			if (!this.run) return
			if (this.run.status=='running') {
				this.run.requestedStatus='paused'
				this.updateRun()
				scheduleRunNextNote()
			} else if (this.run.status=='paused') {
				this.run.requestedStatus='running'
				this.updateRun()
				scheduleRunNextNote()
			}
		}
		return [
			this.$asOutput,` `,this.$withOutput,` `,
			makeDiv('major-input')(this.$commentText),
			makeDiv('gridded-input')(...this.interactionDescriptions.map(({$button})=>$button)),
			this.$runButton,` `,this.$runOutput
		]
	}
	onLoginChange(): boolean {
		this.updateYourNotes()
		this.updateAsOutput()
		this.updateButtons()
		return true
	}
	onSelectedNotesChange(selectedNotes: ReadonlyArray<Note>) {
		for (const status of noteStatuses) {
			const ids=this.selectedNoteIds.get(status)
			if (ids) ids.length=0
		}
		for (const selectedNote of selectedNotes) {
			const ids=this.selectedNoteIds.get(selectedNote.status)
			ids?.push(selectedNote.id)
		}
		this.updateWithOutput()
		this.updateButtons()
		return true
	}
	private updateYourNotes() {
		const apiText=`your own latest updated notes`
		const webText=`your notes page`
		if (this.auth.username==null) {
			this.$yourNotesApi.replaceChildren(apiText)
			this.$yourNotesWeb.replaceChildren(webText)
		} else {
			const apiHref=makeHrefWithCurrentHost([
				['mode','search'],
				['display_name',this.auth.username],
				['sort','updated_at']
			])
			const webHref=this.auth.server.web.getUrl(e`user/${this.auth.username}/notes`)
			this.$yourNotesApi.replaceChildren(makeLink(apiText,apiHref))
			this.$yourNotesWeb.replaceChildren(makeLink(webText,webHref))
		}
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
		const writeSingleNote=(id:number,status:Note['status'])=>{
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
		const writeOneOrManyNotes=(ids:readonly number[],status:Note['status'])=>{
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
		const nSelectedNotes=noteStatuses.reduce(
			(n:number,status)=>n+(this.selectedNoteIds.get(status)?.length??0),
		0)
		if (nSelectedNotes==0) {
			this.$withOutput.replaceChildren()
		} else if (nSelectedNotes<=5) {
			this.$withOutput.replaceChildren(`with `)
			for (const [status,ids] of this.selectedNoteIds) {
				for (const id of ids) {
					writeSingleNote(id,status)
				}
			}
		} else {
			this.$withOutput.replaceChildren(`with `)
			for (const [status,ids] of this.selectedNoteIds) {
				writeOneOrManyNotes(ids,status)
			}
		}
	}
	private updateButtons() {
		const buttonNoteIcon=(ids:readonly number[],inputStatus:Note['status'],outputStatus:Note['status']): (string|HTMLElement)[]=>{
			const outputIcon=[]
			if (outputStatus!=inputStatus) {
				outputIcon.push(` → `,makeNoteStatusIcon(outputStatus,ids.length))
			}
			if (ids.length==0) {
				return [makeNotesIcon('selected')]
			} else if (ids.length==1) {
				return [makeNoteStatusIcon(inputStatus),` ${ids[0]}`,...outputIcon]
			} else {
				return [`${ids.length} × `,makeNoteStatusIcon(inputStatus,ids.length),...outputIcon]
			}
		}
		for (const interactionDescription of this.interactionDescriptions) {
			const inputNoteIds=this.selectedNoteIds.get(interactionDescription.inputNoteStatus)??[]
			const {$button}=interactionDescription
			let cancelCondition=false
			if (this.run && this.run.status!='finished') {
				cancelCondition=this.run.status=='paused' && this.run.interactionDescription==interactionDescription
				$button.disabled=(
					this.run.status=='running' ||
					this.run.status=='paused' && this.run.interactionDescription!=interactionDescription
				)
			} else {
				$button.disabled=inputNoteIds.length==0
			}
			if (cancelCondition) {
				$button.replaceChildren(`Cancel`)
			} else {
				$button.replaceChildren(
					`${interactionDescription.label} `,...buttonNoteIcon(inputNoteIds,interactionDescription.inputNoteStatus,interactionDescription.outputNoteStatus)
				)
			}
			$button.hidden=interactionDescription.forModerator && !this.auth.isModerator
		}
		if (this.$commentText.value=='') this.$commentButton.disabled=true
	}
	private updateRun() {
		const canPause=this.run && this.run.status=='running'
		this.$runButton.replaceChildren(canPause
			? makeActionIcon('pause',`Halt`)
			: makeActionIcon('play',`Resume`)
		)
		this.$runButton.disabled=!this.run || this.run.status!=this.run.requestedStatus
		if (!this.run) this.$runOutput.replaceChildren(
			`select notes for interaction using checkboxes`
		)
	}
	private makeRunScheduler(callbacks: ToolCallbacks): ()=>void {
		let runTimeoutId: number|undefined
		const runNextNote=async():Promise<boolean>=>{
			const run=()=>{
				this.$commentText.disabled=true
			}
			const pause=()=>{
				this.$commentText.disabled=false
				this.updateButtons()
				this.updateRun()
			}
			const finish=()=>{
				this.$commentText.disabled=false
				this.$commentText.value=''
				this.updateButtons()
				this.updateRun()
			}
			if (!this.run) return false
			if (this.run.status=='finished') {
				return false
			} else if (this.run.status=='paused') {
				if (this.run.requestedStatus=='paused') {
					return false
				} else if (this.run.requestedStatus=='running') {
					this.run.status='running'
					run()
				}
			} else if (this.run.status=='running') {
				if (this.run.requestedStatus=='paused') {
					this.run.status='paused'
					pause()
					return false
				}
			}
			if (this.run.inputNoteIds.length==0) {
				this.run.status='finished'
				finish()
				this.$runOutput.replaceChildren(
					this.run.interactionDescription.runningLabel,` finished`
				)
				return false
			}
			this.updateButtons()
			this.updateRun()
			const id=this.run.inputNoteIds[0]
			this.$runOutput.replaceChildren(
				this.run.interactionDescription.runningLabel,` note ${id}`
			)
			try {
				let response: Response
				if (this.run.interactionDescription.verb=='DELETE') {
					const path=e`notes/${id}.json`
					response=await this.auth.server.api.fetch(path,{
						method: 'POST',
						headers: {
							Authorization: 'Bearer '+this.auth.token
						}
					})
				} else { // POST
					const path=e`notes/${id}/${this.run.interactionDescription.endpoint}.json`
					response=await this.auth.server.api.postUrlencoded(path,{
						Authorization: 'Bearer '+this.auth.token
					},[
						['text',this.$commentText.value],
					])
				}
				if (!response.ok) {
					throw new InteractionError(await response.text())
				}
				this.run.inputNoteIds.shift()
				const noteAndUsers=await readNoteResponse(id,response)
				callbacks.onNoteReload(this,...noteAndUsers)
				this.$runOutput.replaceChildren(
					this.run.interactionDescription.runningLabel
				)
			} catch (ex) {
				const $a=makeLink(`note ${id}`,'#') // TODO link to current note
				$a.classList.add('error')
				if (ex instanceof InteractionError) {
					$a.title=ex.message
				} else if (ex instanceof NoteDataError) {
					$a.title=`Error after successful interaction: ${ex.message}`
				} else {
					$a.title=`Unknown error ${ex}`
				}
				this.run.status='paused'
				pause()
				this.$runOutput.replaceChildren(
					this.run.interactionDescription.runningLabel,` error on `,$a
				)
			}
			return true
		}
		const wrappedRunNextNote=async()=>{
			let reschedule=false
			try {
				reschedule=await runNextNote()
			} catch {}
			runTimeoutId=undefined
			if (reschedule) scheduleRunNextNote()
		}
		const scheduleRunNextNote=()=>{
			if (runTimeoutId) return
			runTimeoutId=setTimeout(wrappedRunNextNote)
		}
		return scheduleRunNextNote
	}
}
