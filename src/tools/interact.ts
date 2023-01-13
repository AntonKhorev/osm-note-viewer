import {Tool, ToolElements, ToolCallbacks, makeNotesIcon} from './base'
import type {Note} from '../data'
import type Server from '../server'
import {makeEscapeTag} from '../escape'

export class InteractTool extends Tool {
	protected selectedNoteIds: ReadonlyArray<number> = []
	private $windowCountOutput=document.createElement('output')
	constructor() {super(
		'interact',
		`Interact`,
		`Interact with notes on OSM server`
	)}
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>): boolean {
		this.selectedNoteIds=selectedNotes.map(note=>note.id)
		const count=selectedNotes.length
		this.$windowCountOutput.textContent=`${count} window${count==1?'':'s'}`
		return true
	}
	getTool(callbacks: ToolCallbacks, server: Server): ToolElements {
		const e=makeEscapeTag(encodeURIComponent)
		const getReportUrl=(id:number)=>server.getWebUrl(e`reports/new?reportable_id=${id}&reportable_type=Note`)
		const getNoteListItem=(id:number)=>`- `+server.getWebUrl(e`note/${id}`)+`\n`
		const getNoteList=()=>this.selectedNoteIds.map(getNoteListItem).join('')
		const copyNoteList=()=>navigator.clipboard.writeText(getNoteList())
		const $reportOneButton=this.makeRequiringSelectedNotesButton()
		$reportOneButton.append(`Report `,makeNotesIcon('selected'),` in one window`)
		$reportOneButton.onclick=async()=>{
			await copyNoteList()
			const id=this.selectedNoteIds[0]
			open(getReportUrl(id))
		}
		const $reportManyButton=this.makeRequiringSelectedNotesButton()
		$reportManyButton.append(`Report `,makeNotesIcon('selected'),` in `,this.$windowCountOutput)
		$reportManyButton.onclick=async()=>{
			// TODO write in description that browser might complain about to many opened windows
			// TODO warn if opens too many windows
			await copyNoteList()
			for (const id of this.selectedNoteIds) {
				open(getReportUrl(id))
			}
		}
		return [
			$reportOneButton,` `,$reportManyButton
		]
	}
}
