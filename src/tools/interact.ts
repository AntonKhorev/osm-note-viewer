import {Tool, ToolElements} from './base'
import type {SimpleStorage} from '../util/storage'
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
import InteractionRunHolder from './interact-run'

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
	private $loginLink=makeSemiLink('input-link')('login')
	private stagedNoteIds= new Map<number,Note['status']>()
	private holder=new InteractionRunHolder(
		this.cx,this.$commentText,
		()=>{
			this.updateWithOutput()
			this.updateButtons()
		}
	)
	private interactionDescriptions=makeInteractionDescriptions(this.$commentButton)
	constructor(storage: SimpleStorage, cx: Connection) {
		super(storage,cx)
		this.updateLoginDependents()
		this.holder.updateUI()
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
		em(`Ids`),` mode will show hidden notes to moderators, but it requires knowing the note ids. `,
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
		return this.holder.$run
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
				const response=await this.cx.server.api.fetch(e`changesets.json?user=${this.cx.uid}&limit=1`)
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
		this.$loginLink.onclick=ev=>{
			bubbleCustomEvent($root,'osmNoteViewer:menuToggle','login')
			ev.stopPropagation()
			ev.preventDefault()
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
		const scheduler=this.holder.installScheduler(
			(type,detail)=>bubbleCustomEvent($tool,type,detail)
		)
		for (const interactionDescription of this.interactionDescriptions) {
			interactionDescription.$button.onclick=()=>{
				if (this.holder.run?.status=='paused') {
					scheduler.cancelRun()
				} else {
					const inputNoteIds=this.getStagedNoteIdsByStatus().get(interactionDescription.inputNoteStatus)
					if (!inputNoteIds) return
					const runImmediately=inputNoteIds.length<=1
					scheduler.scheduleRun(interactionDescription,inputNoteIds,runImmediately)
				}
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
			if (this.holder.run?.status=='running') return
			this.updateWithOutput()
			this.updateButtons()
			this.ping($tool)
		})
		return [
			this.$asOutput,` `,this.$withOutput,` `,this.$copyIdsButton,
			makeDiv('input-group','major')(
				appendLastChangeset.$controls,
				makeLabel()(
					`Comment `,
					this.$commentText
				)
			),
			makeDiv('input-group','gridded')(...this.interactionDescriptions.map(({$button})=>$button)),
			this.holder.$run
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
			if (this.holder.run && this.holder.run.status!='finished') {
				cancelCondition=this.holder.run.status=='paused' && this.holder.run.interactionDescription==interactionDescription
				$button.disabled=(
					this.holder.run.status=='running' ||
					this.holder.run.status=='paused' && this.holder.run.interactionDescription!=interactionDescription
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
