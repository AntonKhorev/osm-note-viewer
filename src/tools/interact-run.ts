import type {Connection} from '../net'
import {makeActionIcon} from '../svg'
import type {InteractionDescription} from './interact-descriptions'
import {getNoteIndicator, getNoteCountIndicator} from './interact-indicator'
import {readNoteResponse, NoteDataError} from '../fetch-note'
import {makeElement, makeDiv} from '../util/html'
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

export interface InteractionRunScheduler {
	scheduleRun(
		interactionDescription: InteractionDescription,
		inputNoteIds: number[],
		runImmediately: boolean
	): void
	cancelRun(): void
}

export default class InteractionRunHolder {
	#run?: InteractionRun
	private readonly $runButtonOutline=makeElement('span')('outline')()
	private $runButtonIcon=makeElement('span')()()
	private readonly $runButton=makeElement('button')('run','only-with-icon')(this.$runButtonIcon,this.$runButtonOutline)
	private readonly $runOutput=document.createElement('output')
	readonly $run=makeDiv('interaction-run')(this.$runButton,this.$runOutput)
	constructor(
		private readonly cx: Connection,
		private readonly $commentText: HTMLTextAreaElement,
		private readonly updateRunControls: ()=>void
	) {}
	get run() {
		return this.#run
	}
	private set run(v: InteractionRun|undefined) {
		this.#run=v
	}
	installScheduler(
		dispatchToolEvent: <T extends keyof HTMLElementEventMap>(
			type: T,
			detail: (HTMLElementEventMap[T] extends CustomEvent<infer D> ? D : never)
		)=>void
	): InteractionRunScheduler {
		let runTimeoutId: number|undefined
		const runNextNote=async():Promise<boolean>=>{
			const transitionToRunning=()=>{
				this.$commentText.disabled=true
				this.updateRunControls()
				this.updateRunButton()
			}
			const transitionToPaused=()=>{
				this.$commentText.disabled=false
				this.updateRunControls()
				this.updateRunButton()
			}
			const transitionToFinished=()=>{
				this.$commentText.disabled=false
				this.$commentText.value=''
				this.$commentText.dispatchEvent(new Event('input')) // update text controls
				this.updateRunControls()
				this.updateRunButton()
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
		this.$runButton.onclick=()=>{
			if (!this.run) return
			if (this.run.status=='running') {
				this.run.requestedStatus='paused'
				this.updateRunButton()
			} else if (this.run.status=='paused') {
				this.run.requestedStatus='running'
				this.updateRunButton()
				scheduleRunNextNote()
			}
		}
		const scheduleRun=(
			interactionDescription: InteractionDescription,
			inputNoteIds: number[],
			runImmediately: boolean
		)=>{
			this.run={
				interactionDescription,
				status: 'paused',
				requestedStatus: runImmediately?'running':'paused',
				inputNoteIds,
				outputNoteIds: []
			}
			this.updateUI()
			if (runImmediately) {
				scheduleRunNextNote()
			} else {
				this.pointToRunButton(interactionDescription.$button)
			}
		}
		const cancelRun=()=>{
			this.run=undefined
			this.updateUI()
		}
		return {scheduleRun,cancelRun}
	}
	updateUI(): void {
		this.updateRunControls()
		this.updateRunButton()
		this.updateRunOutput()
	}
	private updateRunButton(): void {
		const canPause=this.run && this.run.status=='running'
		const $newIcon=(canPause
			? makeActionIcon('pause',`Halt`)
			: makeActionIcon('play',`Resume`)
		)
		this.$runButtonIcon.replaceWith($newIcon)
		this.$runButtonIcon=$newIcon
		this.$runButton.disabled=!this.run || this.run.status!=this.run.requestedStatus
	}
	private pointToRunButton($fromButton: HTMLElement): void {
		this.$runButtonOutline.style.outlineColor='var(--click-color)'
		this.$runButtonOutline.style.outlineStyle='solid'
		this.$runButtonOutline.style.transformOrigin='0% 0%'
		const $e1=$fromButton
		const $e2=this.$runButton
		const rect1=$e1.getBoundingClientRect()
		const rect2=$e2.getBoundingClientRect()
		const xSize1=$e1.clientWidth, ySize1=$e1.clientHeight
		const xSize2=$e2.clientWidth, ySize2=$e2.clientHeight
		this.$runButtonOutline.style.removeProperty('transition')
		requestAnimationFrame(()=>{
			this.$runButtonOutline.style.translate=`${rect1.x-rect2.x}px ${rect1.y-rect2.y}px`
			this.$runButtonOutline.style.scale=`${xSize1/xSize2} ${ySize1/ySize2}`
			this.$runButtonOutline.style.opacity=`1`
			requestAnimationFrame(()=>{
				this.$runButtonOutline.style.transition=`translate 300ms, scale 300ms, opacity 300ms 300ms`
				this.$runButtonOutline.style.translate=`0px 0px`
				this.$runButtonOutline.style.scale=`1`
				this.$runButtonOutline.style.opacity=`0`
			})
		})
	}
	private updateRunOutput(): void {
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
