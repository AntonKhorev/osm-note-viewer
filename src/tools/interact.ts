import {Tool, ToolElements, ToolCallbacks, makeNotesIcon} from './base'
import type {Note} from '../data'
import type Auth from '../auth'
import ConfirmedButtonListener from '../confirmed-button-listener'
import {makeDiv, makeLink, wrapFetchForButton, makeGetKnownErrorMessage} from '../html'
import {em,p,ul,li} from '../html-shortcuts'
import {makeEscapeTag} from '../escape'

class NoteInteractionError extends TypeError {}

export class InteractTool extends Tool {
	private selectedNoteIds: ReadonlyArray<number> = []
	private $tabCountOutput=document.createElement('output')
	private $confirmTabCountOutput=document.createElement('output')
	private reportManyListener?: ConfirmedButtonListener
	constructor() {super(
		'interact',
		`Interact`,
		`Interact with notes on OSM server`,
		true
	)}
	getInfo() {return[p(
		`Currently allows `,makeLink(`reporting`,'https://wiki.openstreetmap.org/wiki/Notes#Reporting_notes'),` selected notes. `,
		`Since reporting on the OSM website works for individual notes but here you can select many, you may choose between opening one and several tabs.`
	),ul(
		li(
			`If you choose to open one tab, it's going to report the first selected note. `,
			`The full list of notes will be copied to clipboard for you to paste into the `,em(`details`),` input.`
		),li(
			`If you choose to open several tabs, each tab will have a report for every individual note you selected. `,
			`Since it could be many tabs opened at once, there's a confirmation button appearing for more than five selected notes. `,
			`Additionally the browser may choose to block opening of new tabs if too many are requested.`
		)
	)]}
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>): boolean {
		this.selectedNoteIds=selectedNotes.map(note=>note.id)
		const count=selectedNotes.length
		this.$tabCountOutput.textContent=this.$confirmTabCountOutput.textContent=`${count} tab${count==1?'':'s'}`
		this.reportManyListener?.reset()
		return true
	}
	getTool(callbacks: ToolCallbacks, auth: Auth): ToolElements {
		const e=makeEscapeTag(encodeURIComponent)
		const getReportUrl=(id:number)=>auth.server.web.getUrl(e`reports/new?reportable_id=${id}&reportable_type=Note`)
		const getNoteListItem=(id:number)=>`- `+auth.server.web.getUrl(e`note/${id}`)+`\n`
		const getNoteList=()=>this.selectedNoteIds.map(getNoteListItem).join('')
		const copyNoteList=()=>navigator.clipboard.writeText(getNoteList())
		const $commentText=document.createElement('textarea')
		const $commentButton=this.makeRequiringSelectedNotesButton(()=>!!$commentText.value)
		const $reportOneButton=this.makeRequiringSelectedNotesButton()
		const $reportManyButton=this.makeRequiringSelectedNotesButton()
		const $cancelReportManyButton=this.makeRequiringSelectedNotesButton()
		const $confirmReportManyButton=this.makeRequiringSelectedNotesButton()
		$commentButton.append(`Comment `,makeNotesIcon('selected'))
		$reportOneButton.append(`Report `,makeNotesIcon('selected'),` in one tab`)
		$reportManyButton.append(`Report `,makeNotesIcon('selected'),` in `,this.$tabCountOutput)
		$cancelReportManyButton.append(`Cancel reporting `,makeNotesIcon('selected'),` in `,this.$confirmTabCountOutput)
		$confirmReportManyButton.append(`Confirm`)
		$commentText.oninput=()=>{
			const noSelectedNotes=$reportOneButton.disabled // TODO rewrite this hack
			$commentButton.disabled=noSelectedNotes || !$commentText.value
		}
		$commentButton.onclick=async()=>{
			await wrapFetchForButton($commentButton,async()=>{
				for (const id of this.selectedNoteIds) {
					const response=await auth.server.api.postUrlencoded(e`notes/${id}/comment`,{
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
			$commentButton.disabled=!$commentText.value
		}
		$reportOneButton.onclick=async()=>{
			await copyNoteList()
			const id=this.selectedNoteIds[0]
			open(getReportUrl(id))
		}
		this.reportManyListener=new ConfirmedButtonListener(
			$reportManyButton,$cancelReportManyButton,$confirmReportManyButton,
			async()=>{
				await copyNoteList()
				for (const id of this.selectedNoteIds) {
					open(getReportUrl(id))
				}
			},
			()=>this.selectedNoteIds.length>5
		)
		return [
			makeDiv('major-input')($commentText),
			makeDiv('major-input')($commentButton),
			makeDiv('major-input')($reportOneButton),
			makeDiv('major-input')(
				$reportManyButton,
				$cancelReportManyButton,
				$confirmReportManyButton
			)
		]
	}
}
