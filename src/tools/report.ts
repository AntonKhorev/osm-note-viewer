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
	),p(
		`It's also possible to `,makeLink(`report the user`,'https://wiki.openstreetmap.org/wiki/Report_user'),` that opened the selected notes, if all of them were opened by the same user. `,
		`For moderators there's a `,makeLink(`block`,'https://wiki.openstreetmap.org/wiki/Data_working_group#User_blocks'),` button. `,
		`The clipboard is going to contain a list of notes, like when reporting notes.`
	)]}
	protected getTool($root: HTMLElement, $tool: HTMLElement): ToolElements {
		let inputUid: number|undefined
		let inputUsername: string|undefined
		let inputNoteIds: ReadonlyArray<number> = []
		const $tabCountOutput=document.createElement('output')
		const $confirmTabCountOutput=document.createElement('output')
		const e=makeEscapeTag(encodeURIComponent)
		const getNoteReportUrl=(id:number)=>this.auth.server.web.getUrl(e`reports/new?reportable_id=${id}&reportable_type=Note`)
		const getUserReportUrl=(id:number)=>this.auth.server.web.getUrl(e`reports/new?reportable_id=${id}&reportable_type=User`)
		const getUserBlockUrl=(username:string)=>this.auth.server.web.getUrl(e`blocks/new/${username}`)
		const getNoteListItem=(id:number)=>`- `+this.auth.server.web.getUrl(e`note/${id}`)+`\n`
		const getNoteList=()=>inputNoteIds.map(getNoteListItem).join('')
		const copyNoteList=()=>navigator.clipboard.writeText(getNoteList())
		const $reportOneButton=this.makeRequiringSelectedNotesButton()
		const $reportManyButton=this.makeRequiringSelectedNotesButton()
		const $cancelReportManyButton=this.makeRequiringSelectedNotesButton()
		const $confirmReportManyButton=this.makeRequiringSelectedNotesButton()
		const $reportUserButton=document.createElement('button')
		const $blockUserButton=document.createElement('button')
		$reportOneButton.append(`Report `,makeNotesIcon('selected'),` in one tab`)
		$reportManyButton.append(`Report `,makeNotesIcon('selected'),` in `,$tabCountOutput)
		$cancelReportManyButton.append(`Cancel reporting `,makeNotesIcon('selected'),` in `,$confirmTabCountOutput)
		$confirmReportManyButton.append(`Confirm`)
		$reportUserButton.append(`Report opening user`)
		$blockUserButton.append(`Block opening user`)
		$blockUserButton.disabled=$reportUserButton.disabled=true
		const updateLoginDependents=()=>{
			$blockUserButton.hidden=!this.auth.isModerator
		}
		updateLoginDependents()
		$reportOneButton.onclick=async()=>{
			await copyNoteList()
			const id=inputNoteIds[0]
			open(getNoteReportUrl(id))
		}
		const reportManyListener=new ConfirmedButtonListener(
			$reportManyButton,$cancelReportManyButton,$confirmReportManyButton,
			async()=>{
				await copyNoteList()
				for (const id of inputNoteIds) {
					open(getNoteReportUrl(id))
				}
			},
			()=>inputNoteIds.length>5
		)
		$reportUserButton.onclick=async()=>{
			if (inputUid==null) return
			await copyNoteList()
			open(getUserReportUrl(inputUid))
		}
		$blockUserButton.onclick=async()=>{
			if (inputUsername==null) return
			await copyNoteList()
			open(getUserBlockUrl(inputUsername))
		}
		$root.addEventListener('osmNoteViewer:changeInputNotes',({detail:[inputNotes,inputUsers]})=>{
			inputUid=inputNotes[0]?.comments[0]?.uid
			inputUsername=inputUid ? inputUsers.get(inputUid) : undefined
			$blockUserButton.disabled=$reportUserButton.disabled=!(
				inputUid!=null && inputNotes.every(note=>note.comments[0]?.uid==inputUid)
			)
			inputNoteIds=inputNotes.map(note=>note.id)
			const count=inputNotes.length
			$tabCountOutput.textContent=$confirmTabCountOutput.textContent=`${count} tab${count==1?'':'s'}`
			reportManyListener.reset()
			this.ping($tool)
		})
		$root.addEventListener('osmNoteViewer:changeLogin',()=>{
			updateLoginDependents()
		})
		return [
			$reportOneButton,` `,
			$reportManyButton,` `,$cancelReportManyButton,` `,$confirmReportManyButton,` `,
			$reportUserButton,` `,$blockUserButton
		]
	}
}
