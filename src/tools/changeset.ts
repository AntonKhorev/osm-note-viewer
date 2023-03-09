import {Tool, ToolElements, makeNotesIcon} from './base'
import {toUrlDate} from '../query-date'
import {makeElement, makeLink} from '../html'
import {makeEscapeTag} from '../escape'
import {isArray} from '../types'

const e=makeEscapeTag(encodeURIComponent)

export class ChangesetTool extends Tool {
	id='changeset'
	name=`Changeset`
	title=`Find changesets related to notes`
	protected getTool($root: HTMLElement, $tool: HTMLElement): ToolElements {
		const getChangesetLink=(data?: unknown):string|HTMLElement=>{
			if (data==null) return `none`
			const changesetId=getLatestChangesetId(data)
			const $a=makeLink(`link`,this.auth.server.web.getUrl(e`changeset/${changesetId}`))
			$a.classList.add('listened')
			$a.dataset.changesetId=String(changesetId)
			return $a
		}
		const $output=makeElement('code')()(getChangesetLink())
		let closingScope: {
			// lat: number
			// lon: number
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
				const response=await this.auth.server.api.fetch(e`changesets.json`+
					`?user=${closingScope.uid}`+
					`&time=2001-01-01,${toUrlDate(closingScope.date)}`
				)
				const data=await response.json()
				$output.replaceChildren(getChangesetLink(data))
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
						// lat: note.lat,
						// lon: note.lon,
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

// TODO copypaste from interact.ts
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
