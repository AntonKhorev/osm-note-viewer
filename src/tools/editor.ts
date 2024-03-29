import {Tool, ToolElements} from './base'
import type {Note} from '../data'
import type NoteMap from '../map'
import {listDecoratedNoteIds, convertDecoratedNoteIdsToPlainText} from '../id-lister'
import {makeNotesIcon, makeMapIcon} from '../svg'
import {makeElement, makeLink, makeLabel} from '../util/html'
import {p,em,ul,li,code} from '../util/html-shortcuts'
import {makeEscapeTag} from '../util/escape'

const e=makeEscapeTag(encodeURIComponent)

abstract class EditorTool extends Tool {
	protected abstract elementAction: string
	protected inputElement: string|undefined
	protected $actOnElementButton=document.createElement('button')
	protected getTool($root: HTMLElement, $tool: HTMLElement, map: NoteMap): ToolElements {
		this.$actOnElementButton.append(`${this.elementAction} OSM element`)
		this.$actOnElementButton.disabled=true
		this.$actOnElementButton.onclick=()=>{
			if (this.inputElement) this.doElementAction(map)
		}
		$root.addEventListener('osmNoteViewer:elementLinkClick',ev=>{
			const $a=ev.target
			if (!($a instanceof HTMLAnchorElement)) return
			const elementType=$a.dataset.elementType
			if (elementType!='node' && elementType!='way' && elementType!='relation') return false
			const elementId=$a.dataset.elementId
			if (!elementId) return
			this.inputElement=`${elementType[0]}${elementId}`
			this.$actOnElementButton.disabled=false
			this.$actOnElementButton.textContent=`${this.elementAction} ${this.inputElement}`
		})
		return this.getControls($root,$tool,map)
	}
	protected abstract getControls($root: HTMLElement, $tool: HTMLElement, map: NoteMap): ToolElements
	protected abstract doElementAction(map: NoteMap): void
}

export class RcTool extends EditorTool {
	id='rc'
	name=`RC`
	title=`Run remote control commands in external editors (usually JOSM)`
	protected elementAction=`Load`
	protected getInfo() {return[p(
		`Load note/map data to an editor with `,
		makeLink(`remote control`,'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl'),
		`.`
	),ul(
		li(`Notes are loaded by `,makeRcCommandLink(`import`),` RC command `,
		`with note webpage the OSM website as the `,code(`url`),` parameter.`),
		li(`Map area is loaded by `,makeRcCommandLink(`load_and_zoom`),` RC command. `,
		`Area loading is also used as an opportunity to set the default changeset source and comment containing note ids using the `,code(`changeset_tags`),` parameter.`),
		li(`OSM elements are loaded by `,makeRcCommandLink(`load_object`),` RC command. The button is enabled after the element link is clicked in some note comment.`)
	)]}
	protected getControls($root: HTMLElement, $tool: HTMLElement, map: NoteMap): ToolElements {
		let inputNotes: ReadonlyArray<Note> = []
		const $commentPrefixInput=makeElement('input')()()
		$commentPrefixInput.type='text'
		$commentPrefixInput.size=10
		const $sourceInput=makeElement('input')()()
		$sourceInput.type='text'
		$sourceInput.size=10
		$sourceInput.value='notes'
		const $loadNotesButton=this.makeRequiringSelectedNotesButton()
		$loadNotesButton.append(`Load `,makeNotesIcon('selected'))
		$loadNotesButton.onclick=async()=>{
			for (const {id} of inputNotes) {
				const noteUrl=this.cx.server.web.getUrl(e`note/${id}`)
				const rcPath=e`import?url=${noteUrl}`
				const success=await openRcPath($loadNotesButton,rcPath)
				if (!success) break
			}
		}
		const $loadMapButton=makeElement('button')()()
		$loadMapButton.append(`Load `,makeMapIcon('area'))
		$loadMapButton.onclick=()=>{
			const bounds=map.bounds
			let rcPath=e`load_and_zoom`+
				`?left=${bounds.getWest()}&right=${bounds.getEast()}`+
				`&top=${bounds.getNorth()}&bottom=${bounds.getSouth()}`
			if ($sourceInput.value) {
				rcPath+=e`&changeset_source=${$sourceInput.value}`
			}
			if (inputNotes.length>=1) {
				const maxTagLength=255
				const changesetCommentJoiner=` - `
				let noteIdsLimit=maxTagLength
				const changesetCommentParts=[] as string[]
				if ($commentPrefixInput.value) {
					changesetCommentParts.push($commentPrefixInput.value)
					noteIdsLimit-=($commentPrefixInput.value.length+changesetCommentJoiner.length)
				}
				const combinedNoteComment=combineNoteComments(inputNotes)
				if (combinedNoteComment) {
					changesetCommentParts.push(combinedNoteComment)
					noteIdsLimit-=(combinedNoteComment.length+changesetCommentJoiner.length)
				}
				const listedNoteIdsComment=convertDecoratedNoteIdsToPlainText(
					listDecoratedNoteIds(inputNotes.map(note=>note.id)),
					noteIdsLimit
				)
				if (listedNoteIdsComment) {
					changesetCommentParts.push(listedNoteIdsComment)
				}
				const changesetComment=changesetCommentParts.join(changesetCommentJoiner)
				rcPath+=e`&changeset_comment=${changesetComment}`
			}
			openRcPath($loadMapButton,rcPath)
		}
		const $commentPrefixLabel=makeLabel('inline')(`comment prefix `,$commentPrefixInput)
		const $sourceLabel=makeLabel('inline')(`source `,$sourceInput)
		$commentPrefixLabel.title=$sourceLabel.title=`works only with Load map area`
		$root.addEventListener('osmNoteViewer:notesInput',ev=>{
			[inputNotes]=ev.detail
			this.ping($tool)
		})
		return [
			$loadNotesButton,` `,$loadMapButton,` `,this.$actOnElementButton,` `,
			`+ `,$commentPrefixLabel,` `,$sourceLabel
		]
	}
	doElementAction() {
		const rcPath=e`load_object?objects=${this.inputElement}`
		openRcPath(this.$actOnElementButton,rcPath)
	}
}

export class IdTool extends EditorTool {
	id='id'
	name=`iD`
	title=`Open an iD editor window`
	protected elementAction=`Select`
	protected getInfo() {return[p(
		`Follow your notes by zooming from one place to another in one `,makeLink(`iD editor`,'https://wiki.openstreetmap.org/wiki/ID'),` window. `,
		`It could be faster to do first here in note-viewer than in iD directly because note-viewer won't try to download more data during panning. `,
		`After zooming in note-viewer, click the `,em(`Open`),` button to open this location in iD. `,
		`When you go back to note-viewer, zoom to another place and click the `,em(`Open`),` button for the second time, the already opened iD instance zooms to that place. `,
		`Your edits are not lost between such zooms.`
	),p(
		`Technical details: this is an attempt to make something like `,em(`remote control`),` in iD editor. `,
		`Convincing iD to load notes has proven to be tricky. `,
		`Your best chance of seeing the selected notes is importing them as a `,em(`gpx`),` file. `,
		`See `,makeLink(`this diary post`,`https://www.openstreetmap.org/user/Anton%20Khorev/diary/398991`),` for further explanations.`,
	),p(
		`Zooming/panning is easier to do, and that's what is currently implemented. `,
		`It's not without quirks however. You'll notice that the iD window opened from here doesn't have the OSM website header. `,
		`This is because the editor is opened at `,code(makeLink(`/id`,`https://www.openstreetmap.org/id`)),
		` url instead of `,code(makeLink(`/edit`,`https://www.openstreetmap.org/edit`)),`. `,
		`It has to be done because otherwise iD won't listen to `,code(`#map`),` changes in the webpage location.`
	),p(
		`There's also the `,em(`Select element`),` button, but it's not guaranteed to work every time. `,
		`There is a way to open a new iD window and have a selected element in it for sure by using `,code(`edit?type=id`),`. `,
		`When working with existing window however, things work differently. `,
		`Selecting an element by using the `,code(`id`),` hash parameter also requires the `,code(`map`),` parameter, otherwise it's ignored. `,
		`There's no way for note-viewer to know iD's current map view location because of cross-origin restrictions, so note-viewer's own map location is passed as `,code(`map`),`. `,
		`Selecting won't work if the element is not already loaded. `,
		`Therefore when you press the `,em(`Select element`),` button on a new location, it likely won't select the element because the element is not yet loaded.`
	)]}
	protected getControls($root: HTMLElement, $tool: HTMLElement, map: NoteMap): ToolElements {
		// limited to what hashchange() lets you do here https://github.com/openstreetmap/iD/blob/develop/modules/behavior/hash.js
		// which is zooming / panning / selecting osm elements
		// selecting requires map parameter set
		const $zoomButton=document.createElement('button')
		$zoomButton.append(`Open `,makeMapIcon('center'))
		$zoomButton.onclick=()=>{
			const url=this.cx.server.web.getUrl(e`id#map=${map.zoom}/${map.lat}/${map.lon}`)
			open(url,'id')
		}
		return [$zoomButton,` `,this.$actOnElementButton]
	}
	doElementAction(map: NoteMap) {
		const url=this.cx.server.web.getUrl(e`id#id=${this.inputElement}&map=${map.zoom}/${map.lat}/${map.lon}`)
		open(url,'id')
	}
}

function makeRcCommandLink(command: string) {
	return code(makeLink(command,`https://josm.openstreetmap.de/wiki/Help/RemoteControlCommands#${command}`))
}

async function openRcPath($button: HTMLButtonElement, rcPath: string): Promise<boolean> {
	const rcUrl=`http://127.0.0.1:8111/`+rcPath
	try {
		const response=await fetch(rcUrl)
		if (response.ok) {
			clearError()
			return true
		}
	} catch {}
	setError()
	return false
	function setError() {
		$button.classList.add('error')
		$button.title='Remote control command failed. Make sure you have an editor open and remote control enabled.'
	}
	function clearError() {
		$button.classList.remove('error')
		$button.title=''
	}
}

function combineNoteComments(inputNotes: Iterable<Note>): string {
	const maxNoteCommentLength=100
	const visitedNoteComments=new Set<string>()
	let combinedNoteComments=''
	for (const note of inputNotes) {
		if (note.comments.length==0) continue
		const [comment]=note.comments[0].text.split('\n',1)
		if (comment.length==0) continue
		if (comment.length>maxNoteCommentLength) break
		if (visitedNoteComments.has(comment)) continue
		if (combinedNoteComments) combinedNoteComments+=`, `
		combinedNoteComments+=comment
		if (combinedNoteComments.length>maxNoteCommentLength) {
			return ''
		}
		visitedNoteComments.add(comment)
	}
	return combinedNoteComments
}
