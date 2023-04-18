import {Tool, ToolElements, makeActionIcon} from './base'
import type {Connection} from '../net'
import {getHashFromLocation, detachValueFromHash, attachValueToFrontOfHash} from '../util/hash'
import type {Note} from '../data'
import {readNoteResponse, NoteDataError} from '../fetch-note'
import TextControl from '../text-control'
import {listDecoratedNoteIds, convertDecoratedNoteIdsToPlainText, convertDecoratedNoteIdsToHtmlText} from '../id-lister'
import {bubbleEvent, bubbleCustomEvent} from '../util/events'
import {makeElement, makeDiv, makeLabel, makeLink, makeSemiLink} from '../util/html'
import {p,ul,li,code,em} from '../util/html-shortcuts'
import {makeEscapeTag} from '../util/escape'
import {isArray} from '../util/types'
import {getMultipleNoteIndicators, getNoteIndicator, getNoteCountIndicator, getButtonNoteIcon} from './interact-indicator'

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
	currentNoteId?: number,
	currentNoteError?: string
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
	private $copyIdsButton=makeElement('button')()('Copy ids')
	private $commentText=document.createElement('textarea')
	private $commentButton=document.createElement('button')
	private $closeButton=document.createElement('button')
	private $reopenButton=document.createElement('button')
	private $hideOpenButton=document.createElement('button')
	private $hideClosedButton=document.createElement('button')
	private $reactivateButton=document.createElement('button')
	private readonly $runButtonOutline=makeElement('span')('outline')()
	private $runButtonIcon=makeElement('span')()()
	private readonly $runButton=makeElement('button')('run','only-with-icon')(this.$runButtonIcon,this.$runButtonOutline)
	private $runOutput=document.createElement('output')
	private $run=makeDiv('interaction-run')(this.$runButton,this.$runOutput)
	private $loginLink=makeSemiLink('input-link')('login')
	private stagedNoteIds= new Map<number,Note['status']>()
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
	constructor(cx: Connection) {
		super(cx)
		this.updateLoginDependents()
		this.updateWithOutput()
		this.updateButtons()
		this.updateRunButton()
		this.updateRunOutput()
	}
	protected getInfo() {return[p(
		`Do the following operations with notes:`
	),ul(
		li(
			makeLink(`comment`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Create_a_new_comment:_Create:_POST_/api/0.6/notes/#id/comment`)
		),li(
			makeLink(`close`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Close:_POST_/api/0.6/notes/#id/close`)
		),li(
			makeLink(`reopen`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Reopen:_POST_/api/0.6/notes/#id/reopen`),
			` — for moderators this API call also makes hidden note visible again ("reactivates" it). `,
			`This means that a hidden note can only be restored to an open state, even if it had been closed before being hidden. `,
			`If you want the note to be closed again, you have to close it yourself after reactivating. `,
			`Also, unlike the OSM website, you can reactivate a note and add a comment in one action. `,
			`The OSM website currently doesn't provide a comment input for note reactivation.`
		),li(
			`for moderators there's also a delete method to hide a note: `,code(`DELETE /api/0.6/notes/#id`)
		)
	),p(
		`If you want to find the notes you interacted with, try searching for `,this.$yourNotesApi,`. `,
		`Unfortunately searching using the API doesn't reveal hidden notes even to moderators. `,
		em(`Plaintext`),` mode will show hidden notes to moderators, but it requires knowing the note ids. `,
		`If you've hidden a note and want to see it but don't know its id, look for the note at `,this.$yourNotesWeb,` on the OSM website.`
	),p(
		`The `,em(`Copy ids`),` button on top is useful for making changeset comments. `,
		`It copies to the clipboard the same note list that you'd get by using the `,em(`Load map area`),` remote control command. `,
		em(`Load map area`),` sets the changeset comment tag to selected notes as a side effect. `,
		`If you're not using remote control but want to get the note list for a comment, you can press `,em(`Copy ids`),` instead.`
	),p(
		em(`Copy ids`),` has the ability to copy note ids as html links if your browser `,makeLink(`supports it`,`https://developer.mozilla.org/en-US/docs/Web/API/Clipboard#clipboard_availability`),`. `,
		`It should work out of the box on Chrome. `,
		`On Firefox as of v111 it requires enabling the `,code(`dom.events.asyncClipboard.clipboardItem`),` setting in `,makeLink(`about:config`,`about:config`),` and reloading the `,em(`note-viewer`),`.`
	)]}
	protected getInfoButtonContainer() {
		return this.$run
	}
	protected getTool($root: HTMLElement, $tool: HTMLElement): ToolElements {
		const appendLastChangeset=new TextControl(
			this.$commentText,
			()=>this.cx.uid!=null,
			()=>true,
			(append)=>!this.$commentText.value.endsWith(append),
			(append)=>{
				this.$commentText.value=this.$commentText.value.slice(0,-append.length)
				this.updateButtons()
			},
			async($a)=>{
				if (this.cx.uid==null) throw new TypeError(`Undefined user id when getting last changeset`)
				const response=await this.cx.server.api.fetch(e`changesets.json?user=${this.cx.uid}`)
				const data=await response.json()
				const changesetId=getLatestChangesetId(data)
				const append=getParagraphAppend(
					this.$commentText.value,
					this.cx.server.web.getUrl(e`changeset/${changesetId}`)
				)
				this.$commentText.value+=append
				this.updateButtons()
				$a.dataset.changesetId=String(changesetId)
				bubbleEvent($a,'osmNoteViewer:changesetLinkClick')
				return append
			},
			()=>[makeElement('span')()(`undo append`)],
			()=>[makeElement('span')()(`append last changeset`)]
		)
		this.$loginLink.onclick=()=>{
			bubbleCustomEvent($root,'osmNoteViewer:menuToggle','login')
		}
		this.$copyIdsButton.onclick=async()=>{
			this.$copyIdsButton.title=''
			this.$copyIdsButton.classList.remove('error')
			const decoratedIds=listDecoratedNoteIds(this.stagedNoteIds.keys())
			const plainText=convertDecoratedNoteIdsToPlainText(decoratedIds)
			try {
				if (navigator.clipboard.write && window.ClipboardItem) {
					const plainBlob=new Blob([plainText],{type:'text/plain'})
					const htmlText=convertDecoratedNoteIdsToHtmlText(decoratedIds,this.cx.server.web)
					const htmlBlob=new Blob([htmlText],{type:'text/html'})
					await navigator.clipboard.write([
						new ClipboardItem({
							[plainBlob.type]:plainBlob,
							[htmlBlob.type]:htmlBlob,
						})
					])
					this.$copyIdsButton.title=`Copied html ids`
				} else {
					await navigator.clipboard.writeText(plainText)
					this.$copyIdsButton.title=`Copied plaintext ids (see tool info if you're using Firefox)`
				}
			} catch {
				this.$copyIdsButton.title=`Copy ids failed`
				this.$copyIdsButton.classList.add('error')
			}
		}
		this.$commentText.oninput=()=>{
			this.updateButtons()
		}
		const scheduleRunNextNote=this.makeRunScheduler($tool)
		for (const interactionDescription of this.interactionDescriptions) {
			interactionDescription.$button.onclick=()=>{
				if (this.run?.status=='paused') {
					this.run=undefined
					this.updateButtons()
					this.updateRunButton()
					this.updateRunOutput()
				} else {
					const inputNoteIds=this.getStagedNoteIdsByStatus().get(interactionDescription.inputNoteStatus)
					if (!inputNoteIds) return
					const runImmediately=inputNoteIds.length<=1
					this.run={
						interactionDescription,
						status: 'paused',
						requestedStatus: runImmediately?'running':'paused',
						inputNoteIds,
						outputNoteIds: []
					}
					if (runImmediately) {
						scheduleRunNextNote()
					} else {
						this.pointToRunButton(interactionDescription.$button)
					}
					this.updateButtons()
					this.updateRunButton()
					this.updateRunOutput()
				}
			}
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
		$root.addEventListener('osmNoteViewer:loginChange',()=>{
			appendLastChangeset.update()
			this.updateLoginDependents()
			this.updateButtons()
			this.ping($tool)
		})
		$root.addEventListener('osmNoteViewer:notesInput',({detail:[inputNotes]})=>{
			this.stagedNoteIds=new Map(inputNotes.map(note=>[note.id,note.status]))
			if (this.run?.status=='running') return
			this.updateWithOutput()
			this.updateButtons()
			this.ping($tool)
		})
		return [
			this.$asOutput,` `,this.$withOutput,` `,this.$copyIdsButton,
			makeDiv('major-input-group')(
				appendLastChangeset.$controls,
				makeLabel()(
					`Comment `,
					this.$commentText
				)
			),
			makeDiv('gridded-input-group')(...this.interactionDescriptions.map(({$button})=>$button)),
			this.$run
		]
	}
	private updateLoginDependents(): void {
		this.updateYourNotes()
		this.updateAsOutput()
	}
	private updateYourNotes(): void {
		const apiText=`your own latest updated notes`
		const webText=`your notes page`
		if (this.cx.username==null) {
			this.$yourNotesApi.replaceChildren(apiText)
			this.$yourNotesWeb.replaceChildren(webText)
		} else {
			const hash=getHashFromLocation()
			const [hostHashValue]=detachValueFromHash('host',hash)
			const queryHash=new URLSearchParams([
				['mode','search'],
				['display_name',this.cx.username],
				['sort','updated_at']
			]).toString()
			const apiHref='#'+attachValueToFrontOfHash('host',hostHashValue,queryHash)
			const webHref=this.cx.server.web.getUrl(e`user/${this.cx.username}/notes`)
			this.$yourNotesApi.replaceChildren(makeLink(apiText,apiHref))
			this.$yourNotesWeb.replaceChildren(makeLink(webText,webHref))
		}
	}
	private updateAsOutput(): void {
		if (this.cx.username==null || this.cx.uid==null) {
			this.$asOutput.replaceChildren(
				this.$loginLink,` to interact`
			)
		} else {
			this.$asOutput.replaceChildren(
				`as `,this.cx.server.web.makeUserLink(this.cx.uid,this.cx.username)
			)
		}
	}
	private updateWithOutput(): void {
		const multipleNoteIndicators=getMultipleNoteIndicators(this.cx.server.web,this.stagedNoteIds,5)
		if (multipleNoteIndicators.length>0) {
			this.$withOutput.replaceChildren(`with `,...multipleNoteIndicators)
		} else {
			this.$withOutput.replaceChildren()
		}
	}
	private updateButtons(): void {
		// button next to with-output
		this.$copyIdsButton.disabled=[...this.stagedNoteIds.values()].every(ids=>ids.length==0)
		this.$copyIdsButton.title=''
		this.$copyIdsButton.classList.remove('error')
		// buttons below comment
		const stagedNoteIdsByStatus=this.getStagedNoteIdsByStatus()
		for (const interactionDescription of this.interactionDescriptions) {
			const inputNoteIds=stagedNoteIdsByStatus.get(interactionDescription.inputNoteStatus)??[]
			const {$button}=interactionDescription
			let cancelCondition=false
			if (this.run && this.run.status!='finished') {
				cancelCondition=this.run.status=='paused' && this.run.interactionDescription==interactionDescription
				$button.disabled=(
					this.run.status=='running' ||
					this.run.status=='paused' && this.run.interactionDescription!=interactionDescription
				)
			} else {
				$button.disabled=!this.cx.token || inputNoteIds.length==0
			}
			if (cancelCondition) {
				$button.replaceChildren(`Cancel`)
			} else {
				$button.replaceChildren(
					`${interactionDescription.label} `,...getButtonNoteIcon(
						inputNoteIds,interactionDescription.inputNoteStatus,interactionDescription.outputNoteStatus
					)
				)
			}
			$button.hidden=interactionDescription.forModerator && !this.cx.isModerator
		}
		if (this.$commentText.value=='') this.$commentButton.disabled=true
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
	private makeRunScheduler($tool: HTMLElement): ()=>void {
		let runTimeoutId: number|undefined
		const runNextNote=async():Promise<boolean>=>{
			const transitionToRunning=()=>{
				this.$commentText.disabled=true
				this.updateButtons()
				this.updateRunButton()
			}
			const transitionToPaused=()=>{
				this.$commentText.disabled=false
				this.updateWithOutput() // may have received input notes change
				this.updateButtons()
				this.updateRunButton()
			}
			const transitionToFinished=()=>{
				this.$commentText.disabled=false
				this.$commentText.value=''
				this.$commentText.dispatchEvent(new Event('input')) // update text controls
				this.updateWithOutput() // may have received input notes change
				this.updateButtons()
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
			bubbleCustomEvent($tool,'osmNoteViewer:beforeNoteFetch',id)
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
				bubbleCustomEvent($tool,'osmNoteViewer:noteFetch',noteAndUsers)
				bubbleCustomEvent($tool,'osmNoteViewer:noteUpdatePush',noteAndUsers)
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
				bubbleCustomEvent($tool,'osmNoteViewer:failedNoteFetch',[id,this.run.currentNoteError])
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
	private getStagedNoteIdsByStatus(): Map<Note['status'],number[]> {
		const stagedNoteIdsByStatus=new Map<Note['status'],number[]>()
		for (const [id,status] of this.stagedNoteIds) {
			const ids=stagedNoteIdsByStatus.get(status)??[]
			ids.push(id)
			stagedNoteIdsByStatus.set(status,ids)
		}
		return stagedNoteIdsByStatus
	}
}

function getLatestChangesetId(data: unknown): number {
	if (
		!data || typeof data !='object' ||
		!('changesets' in data) ||
		!isArray(data.changesets)
	) throw new TypeError(`Invalid changesets data`)
	const latestChangesetData=data.changesets[0]
	if (!latestChangesetData) throw new TypeError(`No changesets found`)
	if (
		typeof latestChangesetData !='object' ||
		!('id' in latestChangesetData) ||
		typeof latestChangesetData.id != 'number'
	) throw new TypeError(`Invalid latest changeset data`)
	return latestChangesetData.id
}

function getParagraphAppend(text: string, appended: string): string {
	const nTargetNewlines=2
	let i=0
	for (;i<nTargetNewlines;i++) {
		if ((text[text.length-1-i]??'\n')!='\n') break
	}
	return '\n'.repeat(nTargetNewlines-i)+appended
}
