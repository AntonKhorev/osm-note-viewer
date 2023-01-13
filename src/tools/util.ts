import {Tool, ToolElements, ToolCallbacks, makeNotesIcon, makeMapIcon, makeActionIcon} from './base'
import type {Note} from '../data'
import type Server from '../server'
import type NoteMap from '../map'
import CommentWriter from '../comment-writer'
import {makeElement, makeLink, makeLabel} from '../html'

type InfoElements = Array<string|HTMLElement>
const p=(...ss: InfoElements)=>makeElement('p')()(...ss)
const em=(s: string)=>makeElement('em')()(s)
const dfn=(s: string)=>makeElement('dfn')()(s)
const ul=(...ss: InfoElements)=>makeElement('ul')()(...ss)
const li=(...ss: InfoElements)=>makeElement('li')()(...ss)
const label=(...ss: InfoElements)=>makeElement('label')('inline')(...ss)

export class AutozoomTool extends Tool {
	constructor() {super(
		'autozoom',
		`Map autozoom`,
		`Select how the map is panned/zoomed to notes`
	)}
	getInfo() {return[p(
		`Pan and zoom the map to notes in the table. `,
		`Can be used as `,em(`zoom to data`),` for notes layer if `,dfn(`to all visible notes`),` is selected. `,
	),p(
		dfn(`To notes on screen in table`),` allows to track notes in the table that are currently visible on screen, panning the map as you scroll through the table. `,
		`This option is convenient to use when `,em(`Track between notes`),` map layer is enabled (and it is enabled by default). This way you can see the current sequence of notes from the table on the map, connected by a line in an order in which they appear in the table.`
	)]}
	getTool(callbacks: ToolCallbacks, server: Server, map: NoteMap): ToolElements {
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

export class CommentsTool extends Tool {
	constructor() {super(
		'comments',
		`Table comments`,
		`Change how comments are displayed in the notes table`
	)}
	getTool(callbacks: ToolCallbacks): ToolElements {
		const $onlyFirstCommentsCheckbox=document.createElement('input')
		$onlyFirstCommentsCheckbox.type='checkbox'
		const $oneLineCommentsCheckbox=document.createElement('input')
		$oneLineCommentsCheckbox.type='checkbox'
		$onlyFirstCommentsCheckbox.onchange=$oneLineCommentsCheckbox.onchange=()=>{
			callbacks.onCommentsViewChange(this,
				$onlyFirstCommentsCheckbox.checked,
				$oneLineCommentsCheckbox.checked
			)
		}
		return [
			`show `,
			label($onlyFirstCommentsCheckbox,` only 1st`),`; `,
			label($oneLineCommentsCheckbox,` on 1 line`),
		]
	}
}

export class RefreshTool extends Tool {
	private isRunning=true
	private $runButton=makeElement('button')('only-with-icon')()
	private $refreshPeriodInput=document.createElement('input')
	constructor() {super(
		'refresh',
		`Refresh notes`,
		`Control automatic and manual refreshing of notes`
	)}
	getTool(callbacks: ToolCallbacks): ToolElements {
		this.updateState(true)
		const $refreshSelect=makeElement('select')()(
			new Option('report'),
			new Option('replace')
		)
		this.$refreshPeriodInput.type='number'
		this.$refreshPeriodInput.min='1'
		this.$refreshPeriodInput.size=5
		this.$refreshPeriodInput.step='any'
		const $refreshAllButton=makeElement('button')('only-with-icon')(makeActionIcon('refresh',`Refresh now`))
		$refreshAllButton.title=`Refresh all notes currently on the screen in the table above`
		this.$runButton.onclick=()=>{
			const newIsRunning=!this.isRunning
			this.updateState(newIsRunning)
			callbacks.onRefresherStateChange(this,newIsRunning,undefined)
		}
		$refreshSelect.onchange=()=>{
			callbacks.onRefresherRefreshChange(this,
				$refreshSelect.value=='replace'
			)
		}
		this.$refreshPeriodInput.oninput=()=>{
			const str=this.$refreshPeriodInput.value
			if (!str) return
			const minutes=Number(str)
			if (!Number.isFinite(minutes) || minutes<=0) return
			callbacks.onRefresherPeriodChange(this,minutes*60*1000)
		}
		$refreshAllButton.onclick=()=>{
			callbacks.onRefresherRefreshAll(this)
		}
		return [
			this.$runButton,` `,
			makeLabel('inline')($refreshSelect,` updated notes`),` `,
			makeLabel('inline')(`every `,this.$refreshPeriodInput),` min. or `,
			$refreshAllButton
		]
	}
	onRefresherStateChange(isRunning: boolean, message: string|undefined): boolean {
		this.updateState(isRunning,message)
		return true
	}
	onRefresherPeriodChange(refreshPeriod: number): boolean {
		let minutes=(refreshPeriod/(60*1000)).toFixed(2)
		if (minutes.includes('.')) {
			minutes=minutes.replace(/\.?0+$/,'')
		}
		this.$refreshPeriodInput.value=minutes
		return true
	}
	private updateState(isRunning: boolean, message?: string) {
		this.isRunning=isRunning
		if (message==null) {
			this.$runButton.classList.remove('error')
			this.$runButton.title=(isRunning?`Halt`:`Resume`)+` note auto refreshing`
		} else {
			this.$runButton.classList.add('error')
			this.$runButton.title=message
		}
		this.$runButton.replaceChildren(isRunning
			? makeActionIcon('pause',`Halt`)
			: makeActionIcon('play',`Resume`)
		)
	}
}

export class TimestampTool extends Tool {
	private $timestampInput=document.createElement('input')
	constructor() {super(
		'timestamp',
		`Timestamp for historic queries`,
		`Set timestamp for queries run by Overpass`
	)}
	getInfo() {return[p(
		`Allows to select a timestamp for use with `,em(`Overpass`),` and `,em(`Overpass turbo`),` commands. `,
		`You can either enter the timestamp in ISO format (or anything else that Overpass understands) manually here click on a date of/in a note comment. `,
		`If present, a `,makeLink(`date setting`,`https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#date`),` is added to Overpass queries. `,
		`The idea is to allow for examining the OSM data at the moment some note was opened/commented/closed to evaluate if this action was correct.`
	),p(
		`Timestamps inside note comments are usually generated by apps like `,makeLink(`MAPS.ME`,`https://wiki.openstreetmap.org/wiki/MAPS.ME`),` to indicate their OSM data version.`
	)]}
	getTool(callbacks: ToolCallbacks): ToolElements {
		// this.$timestampInput.type='datetime-local' // no standard datetime input for now because they're being difficult with UTC and 24-hour format.
		// this.$timestampInput.step='1'
		this.$timestampInput.type='text'
		this.$timestampInput.size=20
		this.$timestampInput.oninput=()=>{
			callbacks.onTimestampChange(this,this.$timestampInput.value)
		}
		const $clearButton=document.createElement('button')
		$clearButton.type='reset'
		$clearButton.textContent='Clear'
		const $form=makeElement('form')()(this.$timestampInput,` `,$clearButton)
		$form.onreset=()=>{
			callbacks.onTimestampChange(this,'')
		}
		return [$form]
	}
	onTimestampChange(timestamp: string): boolean {
		this.$timestampInput.value=timestamp
		return true
	}
}

export class ParseTool extends Tool {
	constructor() {super(
		'parse',
		`Parse links`,
		`Extract interactive links from plaintext`
	)}
	getInfo() {return[p(
		`Parse text as if it's a note comment and get its first active element. If such element exists, it's displayed as a link after →. `,
		`Currently detected active elements are: `,
	),ul(
		li(`links to images made in `,makeLink(`StreetComplete`,`https://wiki.openstreetmap.org/wiki/StreetComplete`)),
		li(`links to OSM notes (clicking the output link is not yet implemented)`),
		li(`links to OSM changesets`),
		li(`links to OSM elements`),
		li(`ISO-formatted timestamps`)
	),p(
		`May be useful for displaying an arbitrary OSM element in the map view. Paste the element URL and click the output link.`
	)]}
	getTool(callbacks: ToolCallbacks, server: Server): ToolElements {
		const commentWriter=new CommentWriter(server)
		const $input=document.createElement('input')
		$input.type='text'
		$input.size=50
		$input.classList.add('complicated')
		const $parseButton=document.createElement('button')
		$parseButton.type='submit'
		$parseButton.textContent='Parse'
		const $clearButton=document.createElement('button')
		$clearButton.type='reset'
		$clearButton.textContent='Clear'
		const $output=document.createElement('code')
		$output.append(getFirstActiveElement([]))
		const $form=makeElement('form')()($input,` `,$parseButton,` `,$clearButton)
		$form.onsubmit=(ev)=>{
			ev.preventDefault()
			const [elements]=commentWriter.makeCommentElements($input.value)
			$output.replaceChildren(getFirstActiveElement(elements))
		}
		$form.onreset=()=>{
			$output.replaceChildren(getFirstActiveElement([]))
		}
		return [$form,` → `,$output]
		function getFirstActiveElement(elements: Array<string|HTMLAnchorElement|HTMLTimeElement>): string|HTMLElement {
			for (const element of elements) {
				if (element instanceof HTMLAnchorElement) {
					element.textContent=`link`
					return element
				} else if (element instanceof HTMLTimeElement) {
					element.textContent=`date`
					return element
				}
			}
			return `none`
		}
	}
}

export class CountTool extends Tool {
	private $fetchedNoteCount=document.createElement('output')
	private $visibleNoteCount=document.createElement('output')
	private $selectedNoteCount=document.createElement('output')
	constructor() {super(
		'counts',
		`Note counts`,
		`See number of fetched/visible/selected notes`
	)}
	getTool(): ToolElements {
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
	constructor() {super(
		'legend',
		`Legend`,
		`What do icons in command panel mean`
	)}
	getTool(): ToolElements {
		return [
			makeMapIcon('center'),` = map center, `,makeMapIcon('area'),` = map area, `,makeNotesIcon('selected'),` = selected notes`
		]
	}
}

export class SettingsTool extends Tool {
	constructor() {super(
		'settings',
		`⚙️`,
		`Settings`
	)}
	getTool(callbacks: ToolCallbacks): ToolElements {
		const $openAllButton=document.createElement('button')
		$openAllButton.textContent=`+ open all tools`
		$openAllButton.onclick=()=>callbacks.onToolOpenToggle(this,true)
		const $closeAllButton=document.createElement('button')
		$closeAllButton.textContent=`− close all tools`
		$closeAllButton.onclick=()=>callbacks.onToolOpenToggle(this,false)
		return [$openAllButton,` `,$closeAllButton]
	}
}
