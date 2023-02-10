import {Tool, ToolElements, makeNotesIcon} from './base'
import ConfirmedButtonListener from '../confirmed-button-listener'
import {makeLink} from '../html'
import {em,p,ul,li} from '../html-shortcuts'
import {makeEscapeTag} from '../escape'

export class ReportTool extends Tool {
	id='report'
	name=`Report`
	title=`Report notes on OSM website`
	protected getInfo() {return[p(
		makeLink(`Report`,'https://wiki.openstreetmap.org/wiki/Notes#Reporting_notes'),` selected notes. `,
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
	protected getTool($root: HTMLElement, $tool: HTMLElement): ToolElements {
		let inputNoteIds: ReadonlyArray<number> = []
		const $tabCountOutput=document.createElement('output')
		const $confirmTabCountOutput=document.createElement('output')
		const e=makeEscapeTag(encodeURIComponent)
		const getReportUrl=(id:number)=>this.auth.server.web.getUrl(e`reports/new?reportable_id=${id}&reportable_type=Note`)
		const getNoteListItem=(id:number)=>`- `+this.auth.server.web.getUrl(e`note/${id}`)+`\n`
		const getNoteList=()=>inputNoteIds.map(getNoteListItem).join('')
		const copyNoteList=()=>navigator.clipboard.writeText(getNoteList())
		const $reportOneButton=this.makeRequiringSelectedNotesButton()
		const $reportManyButton=this.makeRequiringSelectedNotesButton()
		const $cancelReportManyButton=this.makeRequiringSelectedNotesButton()
		const $confirmReportManyButton=this.makeRequiringSelectedNotesButton()
		$reportOneButton.append(`Report `,makeNotesIcon('selected'),` in one tab`)
		$reportManyButton.append(`Report `,makeNotesIcon('selected'),` in `,$tabCountOutput)
		$cancelReportManyButton.append(`Cancel reporting `,makeNotesIcon('selected'),` in `,$confirmTabCountOutput)
		$confirmReportManyButton.append(`Confirm`)
		$reportOneButton.onclick=async()=>{
			await copyNoteList()
			const id=inputNoteIds[0]
			open(getReportUrl(id))
		}
		const reportManyListener=new ConfirmedButtonListener(
			$reportManyButton,$cancelReportManyButton,$confirmReportManyButton,
			async()=>{
				await copyNoteList()
				for (const id of inputNoteIds) {
					open(getReportUrl(id))
				}
			},
			()=>inputNoteIds.length>5
		)
		$root.addEventListener('osmNoteViewer:changeInputNotes',ev=>{
			const [inputNotes]=ev.detail
			inputNoteIds=inputNotes.map(note=>note.id)
			const count=inputNotes.length
			$tabCountOutput.textContent=$confirmTabCountOutput.textContent=`${count} tab${count==1?'':'s'}`
			reportManyListener.reset()
			this.ping($tool)
		})
		return [
			$reportOneButton,` `,
			$reportManyButton,` `,$cancelReportManyButton,` `,$confirmReportManyButton
		]
	}
}
