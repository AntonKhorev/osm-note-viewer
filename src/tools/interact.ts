import {Tool, ToolElements, makeActionIcon} from './base'
import type {Connection} from '../net'
import {getHashFromLocation, detachValueFromHash, attachValueToFrontOfHash} from '../util/hash'
import type {Note} from '../data'
import TextControl from '../text-control'
import {listDecoratedNoteIds, convertDecoratedNoteIdsToPlainText, convertDecoratedNoteIdsToHtmlText} from '../id-lister'
import {bubbleEvent, bubbleCustomEvent} from '../util/events'
import {makeElement, makeDiv, makeLabel, makeLink, makeSemiLink} from '../util/html'
import {p,ul,li,code,em} from '../util/html-shortcuts'
import {makeEscapeTag} from '../util/escape'
import {isArray} from '../util/types'
import makeInteractionDescriptions from './interact-descriptions'
import {getMultipleNoteIndicators, getButtonNoteIcon} from './interact-indicator'
import InteractionScheduler from './interact-scheduler'

const e=makeEscapeTag(encodeURIComponent)

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
	private readonly $runButtonOutline=makeElement('span')('outline')()
	private $runButtonIcon=makeElement('span')()()
	private readonly $runButton=makeElement('button')('run','only-with-icon')(this.$runButtonIcon,this.$runButtonOutline)
	private $runOutput=document.createElement('output')
	private $run=makeDiv('interaction-run')(this.$runButton,this.$runOutput)
	private $loginLink=makeSemiLink('input-link')('login')
	private stagedNoteIds= new Map<number,Note['status']>()
	private scheduler=new InteractionScheduler(
		this.cx,this.$commentText,this.$runOutput,
		()=>{
			this.updateWithOutput()
			this.updateButtons()
			this.updateRunButton()
		}
	)
	private interactionDescriptions=makeInteractionDescriptions(this.$commentButton)
	constructor(cx: Connection) {
		super(cx)
		this.updateLoginDependents()
		this.updateWithOutput()
		this.updateButtons()
		this.updateRunButton()
		this.scheduler.updateRunOutput()
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
		const startRun=this.scheduler.prepareToStartRun(
			(type,detail)=>bubbleCustomEvent($tool,type,detail)
		)
		for (const interactionDescription of this.interactionDescriptions) {
			interactionDescription.$button.onclick=()=>{
				if (this.scheduler.run?.status=='paused') {
					this.scheduler.cancelRun()
				} else {
					const inputNoteIds=this.getStagedNoteIdsByStatus().get(interactionDescription.inputNoteStatus)
					if (!inputNoteIds) return
					const runImmediately=inputNoteIds.length<=1
					this.scheduler.scheduleRun(interactionDescription,inputNoteIds,runImmediately)
					if (runImmediately) {
						startRun()
					} else {
						this.pointToRunButton(interactionDescription.$button)
					}
				}
			}
		}
		this.$runButton.onclick=()=>{
			if (!this.scheduler.run) return
			if (this.scheduler.run.status=='running') {
				this.scheduler.run.requestedStatus='paused'
				this.updateRunButton()
			} else if (this.scheduler.run.status=='paused') {
				this.scheduler.run.requestedStatus='running'
				this.updateRunButton()
				startRun()
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
			if (this.scheduler.run?.status=='running') return
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
			if (this.scheduler.run && this.scheduler.run.status!='finished') {
				cancelCondition=this.scheduler.run.status=='paused' && this.scheduler.run.interactionDescription==interactionDescription
				$button.disabled=(
					this.scheduler.run.status=='running' ||
					this.scheduler.run.status=='paused' && this.scheduler.run.interactionDescription!=interactionDescription
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
		const canPause=this.scheduler.run && this.scheduler.run.status=='running'
		const $newIcon=(canPause
			? makeActionIcon('pause',`Halt`)
			: makeActionIcon('play',`Resume`)
		)
		this.$runButtonIcon.replaceWith($newIcon)
		this.$runButtonIcon=$newIcon
		this.$runButton.disabled=!this.scheduler.run || this.scheduler.run.status!=this.scheduler.run.requestedStatus
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
