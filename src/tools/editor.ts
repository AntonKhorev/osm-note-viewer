import {Tool, ToolElements, makeNotesIcon, makeMapIcon} from './base'
import type {Note} from '../data'
import type NoteMap from '../map'
import {makeLink} from '../html'
import {p,em,ul,li,code} from '../html-shortcuts'
import {makeEscapeTag} from '../escape'

export class RcTool extends Tool {
	id='rc'
	name=`RC`
	title=`Run remote control commands in external editors (usually JOSM)`
	protected getInfo() {return[p(
		`Load note/map data to an editor with `,
		makeLink(`remote control`,'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl'),
		`.`
	),ul(
		li(`Notes are loaded by `,makeRcCommandLink(`import`),` RC command `,
		`with note webpage the OSM website as the `,code(`url`),` parameter.`),
		li(`Map area is loaded by `,makeRcCommandLink(`load_and_zoom`),` RC command. `,
		`Area loading is also used as an opportunity to set the default changeset comment containing note ids using the `,code(`changeset_tags`),` parameter.`),
		li(`OSM elements are loaded by `,makeRcCommandLink(`load_object`),` RC command. The button is enabled after the element link is clicked in some note comment.`)
	)]}
	protected getTool($root: HTMLElement, $tool: HTMLElement, map: NoteMap): ToolElements {
		let inputNotes: ReadonlyArray<Note> = []
		let inputElement: string|undefined
		const e=makeEscapeTag(encodeURIComponent)
		const $loadNotesButton=this.makeRequiringSelectedNotesButton()
		$loadNotesButton.append(`Load `,makeNotesIcon('selected'))
		$loadNotesButton.onclick=async()=>{
			for (const {id} of inputNotes) {
				const noteUrl=this.auth.server.web.getUrl(e`note/${id}`)
				const rcPath=e`import?url=${noteUrl}`
				const success=await openRcPath($loadNotesButton,rcPath)
				if (!success) break
			}
		}
		const $loadMapButton=document.createElement('button')
		$loadMapButton.append(`Load `,makeMapIcon('area'))
		$loadMapButton.onclick=()=>{
			const bounds=map.bounds
			let rcPath=e`load_and_zoom`+
				`?left=${bounds.getWest()}&right=${bounds.getEast()}`+
				`&top=${bounds.getNorth()}&bottom=${bounds.getSouth()}`
			if (inputNotes.length>=1) {
				const changesetComment=(inputNotes.length>1
					? `notes `+inputNotes.map(note=>note.id).join(`, `)
					: `note ${inputNotes[0].id}`
				)
				const changesetTags=`comment=${changesetComment}`
				rcPath+=`&changeset_tags=${changesetTags}`
			}
			openRcPath($loadMapButton,rcPath)
		}
		const $loadElementButton=document.createElement('button')
		$loadElementButton.append(`Load OSM element`)
		$loadElementButton.disabled=true
		$loadElementButton.onclick=()=>{
			if (!inputElement) return
			const rcPath=e`load_object?objects=${inputElement}`
			openRcPath($loadElementButton,rcPath)
		}
		$root.addEventListener('osmNoteViewer:changeInputNotes',ev=>{
			[inputNotes]=ev.detail
			this.ping($tool)
		})
		$root.addEventListener('osmNoteViewer:clickElementLink',ev=>{
			const $a=ev.target
			if (!($a instanceof HTMLAnchorElement)) return
			const elementType=$a.dataset.elementType
			if (elementType!='node' && elementType!='way' && elementType!='relation') return false
			const elementId=$a.dataset.elementId
			if (!elementId) return
			inputElement=`${elementType[0]}${elementId}`
			$loadElementButton.disabled=false
			$loadElementButton.textContent=`Load ${inputElement}`
		})
		return [$loadNotesButton,` `,$loadMapButton,` `,$loadElementButton]
	}
}

export class IdTool extends Tool {
	id='id'
	name=`iD`
	title=`Open an iD editor window`
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
		`This is because the editor is opened at `,makeLink(`/id`,`https://www.openstreetmap.org/id`),` url instead of `,makeLink(`/edit`,`https://www.openstreetmap.org/edit`),`. `,
		`It has to be done because otherwise iD won't listen to `,em(`#map`),` changes in the webpage location.`
	)]}
	protected getTool($root: HTMLElement, $tool: HTMLElement, map: NoteMap): ToolElements {
		// limited to what hashchange() lets you do here https://github.com/openstreetmap/iD/blob/develop/modules/behavior/hash.js
		// which is zooming/panning
		const $zoomButton=document.createElement('button')
		$zoomButton.append(`Open `,makeMapIcon('center'))
		$zoomButton.onclick=()=>{
			const e=makeEscapeTag(encodeURIComponent)
			const url=this.auth.server.web.getUrl(e`id#map=${map.zoom}/${map.lat}/${map.lon}`)
			open(url,'id')
		}
		return [$zoomButton]
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
