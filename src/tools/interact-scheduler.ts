import type {Connection} from '../net'
import type {InteractionDescription} from './interact-descriptions'
import {getNoteIndicator, getNoteCountIndicator} from './interact-indicator'
import {readNoteResponse, NoteDataError} from '../fetch-note'
import {makeEscapeTag} from '../util/escape'

const e=makeEscapeTag(encodeURIComponent)

class InteractionError extends TypeError {}

export type InteractionRun = {
	interactionDescription: InteractionDescription
	status: 'running' | 'paused' | 'finished'
	requestedStatus: 'running' | 'paused'
	inputNoteIds: number[]
	outputNoteIds: number[]
	currentNoteId?: number,
	currentNoteError?: string
}

export default class InteractionScheduler {
	run?: InteractionRun
	constructor(
		private readonly cx: Connection,
		private readonly $commentText: HTMLTextAreaElement,
		private readonly $runOutput: HTMLOutputElement,
		private readonly updateRunControls: ()=>void
	) {}
	prepareToStartRun(
		dispatchToolEvent: <T extends keyof HTMLElementEventMap>(
			type: T,
			detail: (HTMLElementEventMap[T] extends CustomEvent<infer D> ? D : never)
		)=>void
	): ()=>void {
		let runTimeoutId: number|undefined
		const runNextNote=async():Promise<boolean>=>{
			const transitionToRunning=()=>{
				this.$commentText.disabled=true
				this.updateRunControls()
			}
			const transitionToPaused=()=>{
				this.$commentText.disabled=false
				this.updateRunControls()
			}
			const transitionToFinished=()=>{
				this.$commentText.disabled=false
				this.$commentText.value=''
				this.$commentText.dispatchEvent(new Event('input')) // update text controls
				this.updateRunControls()
				this.updateRunOutput()
			}
			if (!this.run) return false
			if (this.run.status=='finished') {
				return false
			} else if (this.run.status=='paused') {
				if (this.run.requestedStatus=='paused') {
					return false
				} else if (this.run.requestedStatus=='running') {
					this.run.status='running'
					transitionToRunning()
				}
			} else if (this.run.status=='running') {
				if (this.run.requestedStatus=='paused') {
					this.run.status='paused'
					transitionToPaused()
					return false
				}
			}
			const id=this.run.currentNoteId??this.run.inputNoteIds.shift()
			if (id==null) {
				this.run.status='finished'
				transitionToFinished()
				return false
			}
			this.run.currentNoteId=id
			this.run.currentNoteError=undefined
			this.updateRunOutput()
			dispatchToolEvent('osmNoteViewer:beforeNoteFetch',id)
			try {
				let response: Response
				const fetchBuilder=this.cx.server.api.fetch.withToken(this.cx.token).withUrlencodedBody([
					['text',this.$commentText.value]
				])
				if (this.run.interactionDescription.verb=='DELETE') {
					const path=e`notes/${id}.json`
					response=await fetchBuilder.delete(path)
				} else { // POST
					const path=e`notes/${id}/${this.run.interactionDescription.endpoint}.json`
					response=await fetchBuilder.post(path)
				}
				if (!response.ok) {
					const contentType=response.headers.get('content-type')
					if (contentType?.includes('text/plain')) {
						throw new InteractionError(await response.text())
					} else {
						throw new InteractionError(`${response.status} ${response.statusText}`)
					}
				}
				const noteAndUsers=await readNoteResponse(id,response)
				dispatchToolEvent('osmNoteViewer:noteFetch',noteAndUsers)
				dispatchToolEvent('osmNoteViewer:noteUpdatePush',noteAndUsers)
				this.run.currentNoteId=undefined
				this.run.outputNoteIds.push(id)
			} catch (ex) {
				if (ex instanceof InteractionError) {
					this.run.currentNoteError=ex.message
				} else if (ex instanceof NoteDataError) {
					this.run.currentNoteError=`Error after successful interaction: ${ex.message}`
				} else {
					this.run.currentNoteError=`Unknown error ${ex}`
				}
				dispatchToolEvent('osmNoteViewer:failedNoteFetch',[id,this.run.currentNoteError])
				this.run.status=this.run.requestedStatus='paused'
				transitionToPaused()
				this.updateRunOutput()
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
	updateRunOutput(): void {
		let firstFragment=true
		const outputFragment=(...content:(string|HTMLElement)[])=>{
			if (firstFragment) {
				firstFragment=false
			} else {
				this.$runOutput.append(` → `)
			}
			this.$runOutput.append(...content)
		}
		if (!this.run) {
			this.$runOutput.replaceChildren(
				`Select notes for interaction using checkboxes`
			)
			return
		}
		this.$runOutput.replaceChildren(
			this.run.interactionDescription.runningLabel,` `
		)
		if (this.run.inputNoteIds.length>0) {
			outputFragment(`queued `,...getNoteCountIndicator(
				this.run.inputNoteIds.length,this.run.interactionDescription.inputNoteStatus
			))
		} else if (this.run.currentNoteId!=null) {
			outputFragment(`queue emptied`)
		}
		if (this.run.currentNoteId!=null) {
			const $a=getNoteIndicator(this.cx.server.web,
				this.run.currentNoteId,this.run.interactionDescription.inputNoteStatus
			)
			if (this.run.currentNoteError) {
				$a.classList.add('error')
				$a.title=this.run.currentNoteError
				outputFragment(`error on `,$a)
			} else {
				outputFragment(`current `,$a)
			}
		}
		if (this.run.outputNoteIds.length>0) {
			outputFragment(`completed `,...getNoteCountIndicator(
				this.run.outputNoteIds.length,this.run.interactionDescription.outputNoteStatus
			))
		}
	}
}
