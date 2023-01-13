import {Tool, ToolElements, ToolCallbacks, makeNotesIcon} from './base'
import type {Note} from '../data'
import type Server from '../server'
import {makeEscapeTag} from '../escape'
import ConfirmedButtonListener from '../confirmed-button-listener'

export class InteractTool extends Tool {
	private selectedNoteIds: ReadonlyArray<number> = []
	private $windowCountOutput=document.createElement('output')
	private $confirmWindowCountOutput=document.createElement('output')
	private reportManyListener?: ConfirmedButtonListener
	constructor() {super(
		'interact',
		`Interact`,
		`Interact with notes on OSM server`
	)}
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>): boolean {
		this.selectedNoteIds=selectedNotes.map(note=>note.id)
		const count=selectedNotes.length
		this.$windowCountOutput.textContent=this.$confirmWindowCountOutput.textContent=`${count} window${count==1?'':'s'}`
		this.reportManyListener?.reset()
		return true
	}
	getTool(callbacks: ToolCallbacks, server: Server): ToolElements {
		const e=makeEscapeTag(encodeURIComponent)
		const getReportUrl=(id:number)=>server.getWebUrl(e`reports/new?reportable_id=${id}&reportable_type=Note`)
		const getNoteListItem=(id:number)=>`- `+server.getWebUrl(e`note/${id}`)+`\n`
		const getNoteList=()=>this.selectedNoteIds.map(getNoteListItem).join('')
		const copyNoteList=()=>navigator.clipboard.writeText(getNoteList())
		const $reportOneButton=this.makeRequiringSelectedNotesButton()
		const $reportManyButton=this.makeRequiringSelectedNotesButton()
		const $cancelReportManyButton=this.makeRequiringSelectedNotesButton()
		const $confirmReportManyButton=this.makeRequiringSelectedNotesButton()
		$reportOneButton.append(`Report `,makeNotesIcon('selected'),` in one window`)
		$reportManyButton.append(`Report `,makeNotesIcon('selected'),` in `,this.$windowCountOutput)
		$cancelReportManyButton.append(`Cancel reporting `,makeNotesIcon('selected'),` in `,this.$confirmWindowCountOutput)
		$confirmReportManyButton.append(`Confirm`)
		$reportOneButton.onclick=async()=>{
			await copyNoteList()
			const id=this.selectedNoteIds[0]
			open(getReportUrl(id))
		}
		this.reportManyListener=new ConfirmedButtonListener(
			$reportManyButton,$cancelReportManyButton,$confirmReportManyButton,
			async()=>{
				// TODO write in description that browser might complain about to many opened windows
				await copyNoteList()
				for (const id of this.selectedNoteIds) {
					open(getReportUrl(id))
				}
			},
			()=>this.selectedNoteIds.length>5
		)
		return [
			$reportOneButton,` `,
			$reportManyButton,` `,$cancelReportManyButton,` `,$confirmReportManyButton
		]
	}
}
