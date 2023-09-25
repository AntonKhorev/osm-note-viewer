import {Tool, ToolElements} from './base'
import {findClosingChangesetId} from './changeset-find'
import {toUrlDate} from '../query-date'
import {getChangesetsFromOsmApiResponse} from '../osm'
import {makeNotesIcon} from '../svg'
import {makeElement, makeLink} from '../util/html'
import {p,ul,li} from '../util/html-shortcuts'
import {makeEscapeTag} from '../util/escape'

const e=makeEscapeTag(encodeURIComponent)

export class ChangesetTool extends Tool {
	id='changeset'
	name=`Changeset`
	title=`Find changesets related to notes`
	protected getInfo() {return[p(
		`Try to find a changeset that contains map changes that lead to the note being closed. `,
		`Works when exactly one note is selected (which you can do by just clicking the note; you don't have to use checkboxes) and it has a closing action performed. `,
		`Only the first closing action is considered (most of notes don't have more than one). `,
		`The success is not guaranteed because the contents of changesets is not examined. `,
		`The current changeset selection rules are:`,
	),ul(
		li(
			`first a collection of changesets is retrieved by `,makeLink(`the changeset query`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Query:_GET_/api/0.6/changesets`),` OSM API call matching the following: `,
			ul(
				li(`changeset belongs to the same user who performed the first closing action on the note`),
				li(`changeset bounding box is within ±0.001° of lat/lon coordinates of the note`),
				li(`changeset was open within ±24 hours of the closing action`),
				li(`changeset is closed`),
			)
		),
		li(
			`among these changesets the one closest in time is selected:`,
			ul(
				li(`the time difference considered is the one between the changeset closing time and the note closing action`),
				li(`time after the closing action is weighted 3× so the changesets closed before the action are favored`)
			)
		),
	)]}
	protected getTool($root: HTMLElement, $tool: HTMLElement): ToolElements {
		const getChangesetLink=(changesetId?: number):string|HTMLElement=>{
			if (changesetId==null) return `none`
			const $a=makeLink(`link`,this.cx.server.web.getUrl(e`changeset/${changesetId}`))
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
				const response=await this.cx.server.api.fetch(e`changesets.json`+
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
