import {Tool, ToolElements, makeNotesIcon,  makeMapIcon, makeNoteStatusIcon, makeActionIcon} from './base'
import DateInput from '../date-input'
import {bubbleCustomEvent} from '../util/events'
import {makeElement, makeLink} from '../util/html'
import {em,dfn,p,code} from '../util/html-shortcuts'

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
	protected getTool($root: HTMLElement, $tool: HTMLElement): ToolElements {
		const $fitModeSelect=makeElement('select')()(
			new Option('is disabled','none'),
			new Option('to selected notes','selectedNotes'),
			new Option('to notes on screen in table','inViewNotes'),
			new Option('to all visible notes','allNotes')
		)
		$fitModeSelect.onchange=()=>{
			bubbleCustomEvent($tool,'osmNoteViewer:mapFitModeChange',$fitModeSelect.value)
		}
		return [$fitModeSelect]
	}
}

export class TimestampTool extends Tool {
	id='timestamp'
	name=`Timestamp`
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
		const dateInput=new DateInput(value=>{
			bubbleCustomEvent($tool,'osmNoteViewer:timestampChange',value)
		})
		$root.addEventListener('osmNoteViewer:timestampChange',ev=>{
			if (ev.target==$tool) return
			dateInput.value=ev.detail
			this.ping($tool)
		})
		const $clearButton=document.createElement('button')
		$clearButton.textContent='Clear'
		$clearButton.onclick=()=>{
			dateInput.value=''
			bubbleCustomEvent($tool,'osmNoteViewer:timestampChange','')
		}
		return [...dateInput.$elements,` `,$clearButton]
	}
}

export class GeoUriTool extends Tool {
	id='geouri'
	name=`Geo URI`
	protected getTool($root: HTMLElement): ToolElements {
		const $output=code('none')
		$root.addEventListener('osmNoteViewer:mapMoveEnd',({detail:{zoom,lat,lon}})=>{
			$output.replaceChildren(
				makeLink('link',`geo:${lat},${lon}?z=${zoom}`)
			)
		})
		return [$output]
	}
}

export class CountTool extends Tool {
	id='counts'
	name=`Note counts`
	title=`See number of fetched/visible/selected notes`
	protected getTool($root: HTMLElement, $tool: HTMLElement): ToolElements {
		const $fetchedNoteCount=makeElement('output')()('0')
		const $visibleNoteCount=makeElement('output')()('0')
		const $selectedNoteCount=makeElement('output')()('0')
		$root.addEventListener('osmNoteViewer:noteCountsChange',ev=>{
			const [nFetched,nVisible,nSelected]=ev.detail
			$fetchedNoteCount.textContent=String(nFetched)
			$visibleNoteCount.textContent=String(nVisible)
			$selectedNoteCount.textContent=String(nSelected)
			this.ping($tool)
		})
		return [
			$fetchedNoteCount,` × `,makeActionIcon('download',`fetched`),`, `,
			$visibleNoteCount,` × `,makeActionIcon('filter',`visible`),`, `,
			$selectedNoteCount,` × `,makeActionIcon('select',`selected`)
		]
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
