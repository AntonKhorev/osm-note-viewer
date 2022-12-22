import {Tool, ToolElements, ToolCallbacks, makeMapIcon} from './base'
import Server from '../server'
import {NoteMap} from '../map'
import {makeElement, makeLink} from '../html'
import {makeEscapeTag} from '../escape'

type InfoElements = Array<string|HTMLElement>
const p=(...ss: InfoElements)=>makeElement('p')()(...ss)

abstract class OverpassTool extends Tool {
	protected timestamp: string = ''
	onTimestampChange(timestamp: string): boolean {
		this.timestamp=timestamp
		return true
	}
	protected getOverpassQueryPreamble(map: NoteMap): string {
		const bounds=map.bounds
		let query=''
		if (this.timestamp) query+=`[date:"${this.timestamp}"]\n`
		query+=`[bbox:${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}]\n`
		query+=`;\n`
		return query
	}
}

export class OverpassTurboTool extends OverpassTool {
	constructor() {super(
		'overpass-turbo',
		`Overpass turbo`
	)}
	getInfo() {return[p(
		`Some Overpass queries to run from `,
		makeLink(`Overpass turbo`,'https://wiki.openstreetmap.org/wiki/Overpass_turbo'),
		`, web UI for Overpass API. `,
		`Useful to inspect historic data at the time a particular note comment was made.`
	)]}
	getTool(callbacks: ToolCallbacks, server: Server, map: NoteMap): ToolElements {
		const $overpassButtons: HTMLButtonElement[] = []
		const buttonClickListener=(withRelations: boolean, onlyAround: boolean)=>{
			const e=makeEscapeTag(encodeURIComponent)
			let query=this.getOverpassQueryPreamble(map)
			if (withRelations) {
				query+=`nwr`
			} else {
				query+=`nw`
			}
			if (onlyAround) {
				const radius=10
				query+=`(around:${radius},${map.lat},${map.lon})`
			}
			query+=`;\n`
			query+=`out meta geom;`
			const location=`${map.lat};${map.lon};${map.zoom}`
			const url=e`https://overpass-turbo.eu/?C=${location}&Q=${query}`
			open(url,'overpass-turbo')
		}
		{
			const $button=document.createElement('button')
			$button.append(`Load `,makeMapIcon('area'),` without relations`)
			$button.onclick=()=>buttonClickListener(false,false)
			$overpassButtons.push($button)
		}{
			const $button=document.createElement('button')
			$button.append(`Load `,makeMapIcon('area'),` with relations`)
			$button.title=`May fetch large unwanted relations like routes.`
			$button.onclick=()=>buttonClickListener(true,false)
			$overpassButtons.push($button)
		}{
			const $button=document.createElement('button')
			$button.append(`Load around `,makeMapIcon('center'))
			$button.onclick=()=>buttonClickListener(false,true)
			$overpassButtons.push($button)
		}
		const result: ToolElements = []
		for (const $button of $overpassButtons) {
			result.push(` `,$button)
		}
		return result
	}
}

export class OverpassDirectTool extends OverpassTool {
	constructor() {super(
		'overpass',
		`Overpass`
	)}
	getInfo() {return[p(
		`Query `,makeLink(`Overpass API`,'https://wiki.openstreetmap.org/wiki/Overpass_API'),` without going through Overpass turbo. `,
		`Shows results on the map. Also gives link to the element page on the OSM website.`
	)]}
	getTool(callbacks: ToolCallbacks, server: Server, map: NoteMap): ToolElements {
		const $button=document.createElement('button')
		$button.append(`Find closest node to `,makeMapIcon('center'))
		const $output=document.createElement('code')
		$output.textContent=`none`
		$button.onclick=async()=>{
			$button.disabled=true
			$output.textContent=`none`
			try {
				const radius=10
				let query=this.getOverpassQueryPreamble(map)
				query+=`node(around:${radius},${map.lat},${map.lon});\n`
				query+=`out skel;`
				const doc=await makeOverpassQuery($button,query)
				if (!doc) return
				const closestNodeId=getClosestNodeId(doc,map.lat,map.lon)
				if (!closestNodeId) {
					$button.classList.add('error')
					$button.title=`Could not find nodes nearby`
					return
				}
				const url=server.getWebUrl(`node/`+encodeURIComponent(closestNodeId))
				const $a=makeLink(`link`,url)
				$a.dataset.elementType='node'
				$a.dataset.elementId=String(closestNodeId)
				$a.classList.add('listened','osm')
				$output.replaceChildren($a)
			} finally {
				$button.disabled=false
			}
		}
		return [$button,` → `,$output]
	}
}

async function makeOverpassQuery($button: HTMLButtonElement, query: string): Promise<Document|undefined> {
	try {
		const response=await fetch(`https://www.overpass-api.de/api/interpreter`,{
			method: 'POST',
			body: new URLSearchParams({data:query})
		})
		const text=await response.text()
		if (!response.ok) {
			setError(`receiving the following message: ${text}`)
			return
		}
		clearError()
		return new DOMParser().parseFromString(text,'text/xml')
	} catch (ex) {
		if (ex instanceof TypeError) {
			setError(`with the following error before receiving a response: ${ex.message}`)
		} else {
			setError(`for unknown reason`)
		}
	}
	function setError(reason: string) {
		$button.classList.add('error')
		$button.title=`Overpass query failed ${reason}`
	}
	function clearError() {
		$button.classList.remove('error')
		$button.title=''
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
