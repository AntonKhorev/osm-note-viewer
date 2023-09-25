import {Tool, ToolElements} from './base'
import {QueryError} from '../net'
import type NoteMap from '../map'
import {getDateFromInputString, convertDateToIsoString} from '../util/date'
import {makeMapIcon} from '../svg'
import {makeElement, makeLabel, makeLink, wrapFetchForButton} from '../util/html'
import {p} from '../util/html-shortcuts'

abstract class OverpassBaseTool extends Tool {
	protected timestamp: string = ''
	protected installTimestampListener($root: HTMLElement, $tool: HTMLElement) {
		$root.addEventListener('osmNoteViewer:timestampChange',ev=>{
			this.timestamp=ev.detail
			this.ping($tool)
		})
	}
	protected getOverpassQueryPreamble(map: NoteMap): string {
		let query=''
		const timestampString=this.timestamp.trim()
		if (timestampString) {
			const date=getDateFromInputString(timestampString)
			if (!isNaN(+date)) {
				query+=`[date:"${convertDateToIsoString(date)}"]\n`
			}
		}
		query+=`[bbox:${map.precisionBounds.swne}]\n`
		query+=`;\n`
		return query
	}
}

export class OverpassTurboTool extends OverpassBaseTool {
	id='overpass-turbo'
	name=`Overpass turbo`
	title=`Open an Overpass turbo window with various queries`
	protected isActiveWithCurrentServer(): boolean {
		return !!this.cx.server.overpassTurbo
	}
	protected getInfo() {return[p(
		`Some Overpass queries to run from `,
		makeLink(`Overpass turbo`,'https://wiki.openstreetmap.org/wiki/Overpass_turbo'),
		`, web UI for Overpass API. `,
		`Useful to inspect historic data at the time a particular note comment was made.`
	)]}
	protected getTool($root: HTMLElement, $tool: HTMLElement, map: NoteMap): ToolElements {
		this.installTimestampListener($root,$tool)
		const $withRelationsCheckbox=makeElement('input')()()
		const $withLandusesCheckbox=makeElement('input')()()
		const buttonClickListener=(onlyAround: boolean)=>{
			let query=this.getOverpassQueryPreamble(map)
			const types=$withRelationsCheckbox.checked ? `nwr` : `nw`
			query+=types
			if (onlyAround) {
				const radius=10
				query+=`(around:${radius},${map.lat},${map.lon})`
			}
			query+=`;\n`
			if (!$withLandusesCheckbox.checked) {
				query+=`${types}._[!landuse];\n`
			}
			query+=`out meta geom;`
			if (!this.cx.server.overpassTurbo) throw new ReferenceError(`no overpass turbo provider`)
			open(this.cx.server.overpassTurbo.getUrl(query,map.lat,map.lon,map.zoom),'overpass-turbo')
		}
		const $loadAreaButton=makeElement('button')()(`Load `,makeMapIcon('area'))
		const $loadAroundButton=makeElement('button')()(`Load around `,makeMapIcon('center'))
		
		$withRelationsCheckbox.type='checkbox'
		const $withRelationsLabel=makeLabel('inline')($withRelationsCheckbox,` relations`)
		$withRelationsLabel.title=`May fetch large unwanted relations like routes`
		$withLandusesCheckbox.type='checkbox'
		$withLandusesCheckbox.checked=true
		const $withLandusesLabel=makeLabel('inline')($withLandusesCheckbox,` landuses`)
		$withLandusesLabel.title=`Landuses often overlap with smaller objects and make them difficult to select in Overpass turbo`
		$loadAreaButton.onclick=()=>buttonClickListener(false)
		$loadAroundButton.onclick=()=>buttonClickListener(true)
		return [
			$loadAreaButton,` `,$loadAroundButton,` `,
			`with `,$withRelationsLabel,` `,$withLandusesLabel
		]
	}
}

export class OverpassTool extends OverpassBaseTool {
	id='overpass'
	name=`Overpass`
	title=`Run an Overpass query`
	protected isActiveWithCurrentServer(): boolean {
		return !!this.cx.server.overpass
	}
	protected getInfo() {return[p(
		`Query `,makeLink(`Overpass API`,'https://wiki.openstreetmap.org/wiki/Overpass_API'),` without going through Overpass turbo. `,
		`Shows results on the map. Also gives link to the element page on the OSM website.`
	)]}
	protected getTool($root: HTMLElement, $tool: HTMLElement, map: NoteMap): ToolElements {
		this.installTimestampListener($root,$tool)
		const $button=document.createElement('button')
		$button.append(`Find closest node to `,makeMapIcon('center'))
		const $output=document.createElement('code')
		$output.textContent=`none`
		$button.onclick=()=>wrapFetchForButton($button,async()=>{
			$output.textContent=`none`
			const radius=10
			let query=this.getOverpassQueryPreamble(map)
			query+=`node(around:${radius},${map.lat},${map.lon});\n`
			query+=`out skel;`
			if (!this.cx.server.overpass) throw new ReferenceError(`no overpass provider`)
			const doc=await this.cx.server.overpass.fetch(query)
			const closestNodeId=getClosestNodeId(doc,map.lat,map.lon)
			if (!closestNodeId) throw `Could not find nodes nearby`
			const url=this.cx.server.web.getUrl(`node/`+encodeURIComponent(closestNodeId))
			const $a=makeLink(`link`,url)
			$a.dataset.elementType='node'
			$a.dataset.elementId=String(closestNodeId)
			$a.classList.add('listened','osm')
			$output.replaceChildren($a)
		},ex=>{
			if (typeof ex == 'string') {
				return ex
			} else if (ex instanceof QueryError) {
				return `Overpass query failed ${ex.reason}`
			} else {
				return `Unknown error ${ex}`
			}
		})
		return [$button,` → `,$output]
	}
}

function getClosestNodeId(doc: Document, centerLat: number, centerLon: number): string | undefined {
	let closestNodeId: string | undefined
	let closestNodeDistanceSquared=Infinity
	for (const node of doc.querySelectorAll('node')) {
		const lat=Number(node.getAttribute('lat'))
		const lon=Number(node.getAttribute('lon'))
		const id=node.getAttribute('id')
		if (!Number.isFinite(lat) || !Number.isFinite(lon) || !id) continue
		const distanceSquared=(lat-centerLat)**2+(lon-centerLon)**2
		if (distanceSquared<closestNodeDistanceSquared) {
			closestNodeDistanceSquared=distanceSquared
			closestNodeId=id
		}
	}
	return closestNodeId
}
