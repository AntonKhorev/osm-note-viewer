import {Tool, ToolElements, ToolCallbacks, makeNotesIcon,  makeMapIcon, makeNoteStatusIcon} from './base'
import type {Note} from '../data'
import type NoteMap from '../map'
import {bubbleCustomEvent, makeElement, makeLink} from '../html'
import {em,dfn,p} from '../html-shortcuts'

export class AutozoomTool extends Tool {
	id='autozoom'
	name=`Map autozoom`
	title=`Select how the map is panned/zoomed to notes`
	protected getInfo() {return[p(
		`Pan and zoom the map to notes in the table. `,
		`Can be used as `,em(`zoom to data`),` for notes layer if `,dfn(`to all visible notes`),` is selected. `,
	),p(
		dfn(`To notes on screen in table`),` allows to track notes in the table that are currently visible on screen, panning the map as you scroll through the table. `,
		`This option is convenient to use when `,em(`Track between notes`),` map layer is enabled (and it is enabled by default). This way you can see the current sequence of notes from the table on the map, connected by a line in an order in which they appear in the table.`
	)]}
	protected getTool($root: HTMLElement, $tool: HTMLElement, callbacks: ToolCallbacks, map: NoteMap): ToolElements {
		const $fitModeSelect=makeElement('select')()(
			new Option('is disabled','none'),
			new Option('to selected notes','selectedNotes'),
			new Option('to notes on screen in table','inViewNotes'),
			new Option('to all visible notes','allNotes')
		)
		$fitModeSelect.onchange=()=>{
			if ($fitModeSelect.value=='allNotes') {
				callbacks.onFitModeChange(this,$fitModeSelect.value)
				map.fitNotes()
			} else if ($fitModeSelect.value=='selectedNotes') {
				callbacks.onFitModeChange(this,$fitModeSelect.value)
				map.fitSelectedNotes()
			} else if ($fitModeSelect.value=='inViewNotes') {
				callbacks.onFitModeChange(this,$fitModeSelect.value)
				map.fitNoteTrack()
			} else {
				callbacks.onFitModeChange(this,undefined)
			}
		}
		return [$fitModeSelect]
	}
}

export class TimestampTool extends Tool {
	id='timestamp'
	name=`Timestamp for historic queries`
	title=`Set timestamp for queries run by Overpass`
	protected getInfo() {return[p(
		`Allows to select a timestamp for use with `,em(`Overpass`),` and `,em(`Overpass turbo`),` commands. `,
		`You can either enter the timestamp in ISO format (or anything else that Overpass understands) manually here click on a date of/in a note comment. `,
		`If present, a `,makeLink(`date setting`,`https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#date`),` is added to Overpass queries. `,
		`The idea is to allow for examining the OSM data at the moment some note was opened/commented/closed to evaluate if this action was correct.`
	),p(
		`Timestamps inside note comments are usually generated by apps like `,makeLink(`MAPS.ME`,`https://wiki.openstreetmap.org/wiki/MAPS.ME`),` to indicate their OSM data version.`
	)]}
	protected getTool($root: HTMLElement, $tool: HTMLElement): ToolElements {
		const $timestampInput=document.createElement('input')
		// $timestampInput.type='datetime-local' // no standard datetime input for now because they're being difficult with UTC and 24-hour format.
		// $timestampInput.step='1'
		$timestampInput.type='text'
		$timestampInput.size=20
		$timestampInput.oninput=()=>{
			bubbleCustomEvent($tool,'osmNoteViewer:changeTimestamp',$timestampInput.value)
		}
		$root.addEventListener('osmNoteViewer:changeTimestamp',ev=>{
			if (ev.target==$tool) return
			$timestampInput.value=ev.detail
			this.ping($tool)
		})
		const $clearButton=document.createElement('button')
		$clearButton.type='reset'
		$clearButton.textContent='Clear'
		const $form=makeElement('form')()($timestampInput,` `,$clearButton)
		$form.onreset=()=>{
			bubbleCustomEvent($tool,'osmNoteViewer:changeTimestamp','')
		}
		return [$form]
	}
}

export class CountTool extends Tool {
	id='counts'
	name=`Note counts`
	title=`See number of fetched/visible/selected notes`
	private $fetchedNoteCount=document.createElement('output')
	private $visibleNoteCount=document.createElement('output')
	private $selectedNoteCount=document.createElement('output')
	protected getTool(): ToolElements {
		this.$fetchedNoteCount.textContent='0'
		this.$visibleNoteCount.textContent='0'
		this.$selectedNoteCount.textContent='0'
		return [
			this.$fetchedNoteCount,` fetched, `,
			this.$visibleNoteCount,` visible, `,
			this.$selectedNoteCount,` selected`
		]
	}
	onNoteCountsChange(nFetched: number, nVisible: number): boolean {
		this.$fetchedNoteCount.textContent=String(nFetched)
		this.$visibleNoteCount.textContent=String(nVisible)
		return true
	}
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): boolean {
		this.$selectedNoteCount.textContent=String(selectedNotes.length)
		return true
	}
}

export class LegendTool extends Tool {
	id='legend'
	name=`Legend`
	title=`What do icons in command panel mean`
	protected getTool(): ToolElements {
		return [
			makeMapIcon('center'),` = map center, `,
			makeMapIcon('area'),` = map area, `,
			makeNotesIcon('selected'),` = selected notes, `,
			makeNoteStatusIcon('open'),` = open (selected) note, `,
			makeNoteStatusIcon('closed'),` = closed (selected) note`
		]
	}
}

export class SettingsTool extends Tool {
	id='settings'
	name=`⚙️`
	title=`Settings`
	protected getTool($root: HTMLElement, $tool: HTMLElement, callbacks: ToolCallbacks): ToolElements {
		const $openAllButton=makeElement('button')('open-all-tools')(`Open all tools`)
		$openAllButton.onclick=()=>callbacks.onToolOpenToggle(this,true)
		const $closeAllButton=makeElement('button')('close-all-tools')(`Close all tools`)
		$closeAllButton.onclick=()=>callbacks.onToolOpenToggle(this,false)
		return [$openAllButton,` `,$closeAllButton]
	}
}
