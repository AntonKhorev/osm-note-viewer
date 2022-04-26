import type {Note} from './data'
import NoteViewerStorage from './storage'
import {NoteMap} from './map'
import {makeDate} from './table-comment'
import downloadAndShowElement from './osm'
import {toReadableDate, toUrlDate} from './query-date'
import {ToolFitMode, ToolCallbacks, toolMakerSequence} from './tools'

export default class CommandPanel {
	// { TODO inputs to remove
	$commentTimeSelect=document.createElement('select')
	$commentTimeInput=document.createElement('input')
	$fetchedNoteCount=document.createElement('output')
	$visibleNoteCount=document.createElement('output')
	$checkedNoteCount=document.createElement('output')
	// }
	private $buttonsRequiringSelectedNotes: HTMLButtonElement[] = []
	private checkedNotes: ReadonlyArray<Note> = []
	private checkedNoteUsers: ReadonlyMap<number,string> = new Map()
	private checkedCommentTime?: string
	private checkedCommentText?: string
	// { tool callbacks rewrite
	#fitMode: ToolFitMode
	// }
	constructor(private $container: HTMLElement, map: NoteMap, storage: NoteViewerStorage) {
		const toolCallbacks: ToolCallbacks = {
			onFitModeChange: (fitMode)=>this.#fitMode=fitMode
		}
		for (const makeTool of toolMakerSequence) {
			const tool=makeTool()
			const storageKey='commands-'+tool.id
			const $toolDetails=document.createElement('details')
			$toolDetails.classList.add('tool')
			$toolDetails.open=!!storage.getItem(storageKey)
			const $toolSummary=document.createElement('summary')
			$toolSummary.textContent=tool.name
			if (tool.title) $toolSummary.title=tool.title
			$toolDetails.addEventListener('toggle',()=>{
				if ($toolDetails.open) {
					storage.setItem(storageKey,'1')
				} else {
					storage.removeItem(storageKey)
				}
			})
			$toolDetails.append($toolSummary,...tool.getTool(toolCallbacks,map))
			const infoElements=tool.getInfo()
			if (infoElements) {
				const $infoDetails=document.createElement('details')
				$infoDetails.classList.add('info')
				const $infoSummary=document.createElement('summary')
				$infoSummary.textContent=`${name} info`
				$infoDetails.append($infoSummary,...infoElements)
				const $infoButton=document.createElement('button')
				$infoButton.classList.add('info')
				$infoButton.title=`tool info`
				const updateInfoButton=()=>{
					if ($infoDetails.open) {
						$infoButton.classList.add('open')
					} else {
						$infoButton.classList.remove('open')
					}
				}
				updateInfoButton()
				$infoButton.addEventListener('click',()=>{
					$infoDetails.open=!$infoDetails.open
				})
				$infoDetails.addEventListener('toggle',()=>{
					updateInfoButton()
				})
				$toolDetails.addEventListener('toggle',()=>{
					if ($toolDetails.open) return
					$infoDetails.open=false
				})
				$toolDetails.append(` `,$infoButton)
				$container.append($toolDetails,$infoDetails)
			} else {
				$container.append($toolDetails)
			}
		}
	}
	receiveNoteCounts(nFetched: number, nVisible: number) { // TODO receive one object with all/visible/selected notes
		this.$fetchedNoteCount.textContent=String(nFetched)
		this.$visibleNoteCount.textContent=String(nVisible)
	}
	receiveCheckedNotes(checkedNotes: ReadonlyArray<Note>, checkedNoteUsers: ReadonlyMap<number,string>): void {
		this.$checkedNoteCount.textContent=String(checkedNotes.length)
		this.checkedNotes=checkedNotes
		this.checkedNoteUsers=checkedNoteUsers
		for (const $button of this.$buttonsRequiringSelectedNotes) {
			$button.disabled=checkedNotes.length<=0
		}
	}
	receiveCheckedComment(checkedCommentTime?: string, checkedCommentText?: string): void {
		this.checkedCommentTime=checkedCommentTime
		this.checkedCommentText=checkedCommentText
		this.pickCommentTime()
	}
	private pickCommentTime(): void {
		const setTime=(time:string):void=>{
			this.$commentTimeInput.value=time
		}
		if (this.$commentTimeSelect.value=='text' && this.checkedCommentText!=null) {
			const match=this.checkedCommentText.match(/\d\d\d\d-\d\d-\d\d[T ]\d\d:\d\d:\d\dZ/)
			if (match) {
				const [time]=match
				return setTime(time)
			}
		}
		setTime(this.checkedCommentTime??'')
	}
	private getOverpassQueryPreamble(map: NoteMap): string {
		const time=this.$commentTimeInput.value
		const bounds=map.bounds
		let query=''
		if (time) query+=`[date:"${time}"]\n`
		query+=`[bbox:${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}]\n`
		// query+=`[bbox:${bounds.toBBoxString()}];\n` // nope, different format
		query+=`;\n`
		return query
	}
	private makeRequiringSelectedNotesButton(): HTMLButtonElement {
		const $button=document.createElement('button')
		$button.disabled=true
		this.$buttonsRequiringSelectedNotes.push($button)
		return $button
	}
	// { tool callbacks rewrite
	get fitMode(): ToolFitMode {
		return this.#fitMode
	}
	// }
}

function makeMapIcon(type: string): HTMLImageElement {
	const $img=document.createElement('img')
	$img.classList.add('icon')
	$img.src=`map-${type}.svg`
	$img.width=19
	$img.height=13
	$img.alt=`map ${type}`
	return $img
}

function makeNotesIcon(type: string): HTMLImageElement {
	const $img=document.createElement('img')
	$img.classList.add('icon')
	$img.src=`notes-${type}.svg`
	$img.width=9
	$img.height=13
	$img.alt=`${type} notes`
	return $img
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
