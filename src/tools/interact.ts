import {Tool, ToolElements, ToolCallbacks, makeNotesIcon} from './base'
import type {Note} from '../data'
import type Server from '../server'
import ConfirmedButtonListener from '../confirmed-button-listener'
import {makeElement, makeLink} from '../html'
import {makeEscapeTag} from '../escape'

type InfoElements = Array<string|HTMLElement>
const p=(...ss: InfoElements)=>makeElement('p')()(...ss)
const em=(s: string)=>makeElement('em')()(s)
const ul=(...ss: InfoElements)=>makeElement('ul')()(...ss)
const li=(...ss: InfoElements)=>makeElement('li')()(...ss)

export class InteractTool extends Tool {
	private selectedNoteIds: ReadonlyArray<number> = []
	private $tabCountOutput=document.createElement('output')
	private $confirmTabCountOutput=document.createElement('output')
	private reportManyListener?: ConfirmedButtonListener
	constructor() {super(
		'interact',
		`Interact`,
		`Interact with notes on OSM server`
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
		$reportOneButton.append(`Report `,makeNotesIcon('selected'),` in one tab`)
		$reportManyButton.append(`Report `,makeNotesIcon('selected'),` in `,this.$tabCountOutput)
		$cancelReportManyButton.append(`Cancel reporting `,makeNotesIcon('selected'),` in `,this.$confirmTabCountOutput)
		$confirmReportManyButton.append(`Confirm`)
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
			$reportOneButton,` `,
			$reportManyButton,` `,$cancelReportManyButton,` `,$confirmReportManyButton
		]
	}
}
