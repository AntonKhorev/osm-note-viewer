import {Tool, ToolElements, makeNotesIcon} from './base'
import {findClosingChangesetId} from './changeset-find'
import {toUrlDate} from '../query-date'
import {getChangesetsFromOsmApiResponse} from '../osm'
import {makeElement, makeLink} from '../html'
import {makeEscapeTag} from '../escape'

const e=makeEscapeTag(encodeURIComponent)

export class ChangesetTool extends Tool {
	id='changeset'
	name=`Changeset`
	title=`Find changesets related to notes`
	protected getTool($root: HTMLElement, $tool: HTMLElement): ToolElements {
		const getChangesetLink=(changesetId?: number):string|HTMLElement=>{
			if (changesetId==null) return `none`
			const $a=makeLink(`link`,this.auth.server.web.getUrl(e`changeset/${changesetId}`))
			$a.classList.add('listened')
			$a.dataset.changesetId=String(changesetId)
			return $a
		}
		const $output=makeElement('code')()(getChangesetLink())
		let closingScope: {
			lat: number
			lon: number
			uid: number
			date: number
		} | undefined
		let insideRequest=false
		const $findClosingButton=makeElement('button')()(`Find closing for `,makeNotesIcon('selected'))
		const updateClosingButton=()=>{
			$findClosingButton.disabled=insideRequest || !closingScope
			if (insideRequest) {
				$findClosingButton.setAttribute('role','progressbar')
				// $findClosingButton.setAttribute('aria-valuetext',`loading`) // TODO test with screen reader
			} else {
				$findClosingButton.removeAttribute('role')
			}
		}
		updateClosingButton()
		$findClosingButton.onclick=async()=>{
			if (!closingScope) return
			insideRequest=true
			$findClosingButton.classList.remove('error')
			$findClosingButton.title=`loading`
			updateClosingButton()
			try {
				const coordDelta=0.001
				const day=60*60*24
				const response=await this.auth.server.api.fetch(e`changesets.json`+
					`?bbox=${closingScope.lon-coordDelta},${closingScope.lat-coordDelta}`+
					     `,${closingScope.lon+coordDelta},${closingScope.lat+coordDelta}`+
					`&user=${closingScope.uid}`+
					`&time=${toUrlDate(closingScope.date-day)},${toUrlDate(closingScope.date+day)}`+
					`&closed=true`
				)
				const data:unknown=await response.json()
				const changesets=getChangesetsFromOsmApiResponse(data)
				const changesetId=findClosingChangesetId(closingScope.date,changesets)
				$output.replaceChildren(getChangesetLink(changesetId))
				$findClosingButton.title=``
			} catch (ex) {
				$findClosingButton.classList.add('error')
				$findClosingButton.title=`error` // TODO message
			} finally {
				insideRequest=false
				updateClosingButton()
			}
		}
		$root.addEventListener('osmNoteViewer:notesInput',({detail:[inputNotes]})=>{
			closingScope=undefined
			if (inputNotes.length==1) {
				const [note]=inputNotes
				for (const comment of note.comments) {
					if (comment.action!='closed' || comment.uid==null) continue
					closingScope={
						lat: note.lat,
						lon: note.lon,
						uid: comment.uid,
						date: comment.date,
					}
					break
				}
			}
			updateClosingButton()
			this.ping($tool)
		})
		return [
			$findClosingButton,` → `,$output
		]
	}
}
