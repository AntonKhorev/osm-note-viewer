import type {Note} from './data'
import NoteViewerStorage from './storage'
import {NoteMap} from './map'
import {toReadableDate, toUrlDate} from './query-date'
import {Tool, ToolFitMode, ToolCallbacks, toolMakerSequence} from './tools'

class ToolBroadcaster {
	constructor(private readonly tools: Tool[]) {}
	private sources: Set<Tool> = new Set()
	broadcastTimestampChange(fromTool: Tool|null, timestamp: string): void {
		if (fromTool) {
			if (this.sources.has(fromTool)) return
			this.sources.add(fromTool)
		}
		for (const tool of this.tools) {
			if (this.sources.has(tool)) continue
			tool.onTimestampChange(timestamp)
		}
		if (fromTool) {
			this.sources.delete(fromTool)
		}
	}
}

export default class ToolPanel {
	// { TODO inputs to remove
	$fetchedNoteCount=document.createElement('output')
	$visibleNoteCount=document.createElement('output')
	$checkedNoteCount=document.createElement('output')
	// }
	private $buttonsRequiringSelectedNotes: HTMLButtonElement[] = []
	private checkedNotes: ReadonlyArray<Note> = []
	private checkedNoteUsers: ReadonlyMap<number,string> = new Map()
	// { tool callbacks rewrite
	private toolBroadcaster: ToolBroadcaster
	#fitMode: ToolFitMode
	// }
	constructor(private $container: HTMLElement, map: NoteMap, storage: NoteViewerStorage) {
		const tools: Tool[] = []
		const toolCallbacks: ToolCallbacks = {
			onFitModeChange: (fromTool,fitMode)=>this.#fitMode=fitMode,
			onTimestampChange: (fromTool,timestamp)=>{
				this.toolBroadcaster.broadcastTimestampChange(fromTool,timestamp)
			}
		}
		for (const makeTool of toolMakerSequence) {
			const tool=makeTool()
			tools.push(tool)
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
		this.toolBroadcaster=new ToolBroadcaster(tools)
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
	receiveTimestamp(timestamp: string): void {
		this.toolBroadcaster.broadcastTimestampChange(null,timestamp)
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
