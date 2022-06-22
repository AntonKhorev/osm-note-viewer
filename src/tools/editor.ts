import {Tool, ToolElements, ToolCallbacks, makeNotesIcon, makeMapIcon} from './base'

import type {Note} from '../data'
import {NoteMap} from '../map'
import {makeElement, makeLink, makeEscapeTag} from '../util'

type InfoElements = Array<string|HTMLElement>
const p=(...ss: InfoElements)=>makeElement('p')()(...ss)
const em=(s: string)=>makeElement('em')()(s)

export class RcTool extends Tool {
	private selectedNotes: ReadonlyArray<Note> = []
	constructor() {super(
		'rc',
		`RC`,
		`JOSM (or another editor) Remote Control`
	)}
	getInfo() {return[p(
		`Load note/map data to an editor with `,
		makeLink(`remote control`,'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl'),
		`.`
	)]}
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		const e=makeEscapeTag(encodeURIComponent)
		const $loadNotesButton=this.makeRequiringSelectedNotesButton()
		$loadNotesButton.append(`Load `,makeNotesIcon('selected'))
		$loadNotesButton.onclick=async()=>{
			for (const {id} of this.selectedNotes) {
				const noteUrl=e`https://www.openstreetmap.org/note/${id}`
				const rcUrl=e`http://127.0.0.1:8111/import?url=${noteUrl}`
				const success=await openRcUrl($loadNotesButton,rcUrl)
				if (!success) break
			}
		}
		const $loadMapButton=document.createElement('button')
		$loadMapButton.append(`Load `,makeMapIcon('area'))
		$loadMapButton.onclick=()=>{
			const bounds=map.bounds
			const rcUrl=e`http://127.0.0.1:8111/load_and_zoom`+
				`?left=${bounds.getWest()}&right=${bounds.getEast()}`+
				`&top=${bounds.getNorth()}&bottom=${bounds.getSouth()}`
			openRcUrl($loadMapButton,rcUrl)
		}
		return [$loadNotesButton,` `,$loadMapButton]
	}
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): boolean {
		this.selectedNotes=selectedNotes
		return true
	}
}

export class IdTool extends Tool {
	constructor() {super(
		'id',
		`iD`
	)}
	getInfo() {return[p(
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
		`This is because the editor is opened at `,makeLink(`/id`,`https://www.openstreetmap.org/id`),` url instead of `,makeLink(`/edit`,`https://www.openstreetmap.org/edit`),`. `,
		`It has to be done because otherwise iD won't listen to `,em(`#map`),` changes in the webpage location.`
	)]}
	getTool(callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		// limited to what hashchange() lets you do here https://github.com/openstreetmap/iD/blob/develop/modules/behavior/hash.js
		// which is zooming/panning
		const $zoomButton=document.createElement('button')
		$zoomButton.append(`Open `,makeMapIcon('center'))
		$zoomButton.onclick=()=>{
			const e=makeEscapeTag(encodeURIComponent)
			const url=e`https://www.openstreetmap.org/id#map=${map.zoom}/${map.lat}/${map.lon}`
			open(url,'id')
		}
		return [$zoomButton]
	}
}

async function openRcUrl($button: HTMLButtonElement, rcUrl: string): Promise<boolean> {
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
