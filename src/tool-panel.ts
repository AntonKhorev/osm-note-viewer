import type {Note} from './data'
import NoteViewerStorage from './storage'
import {NoteMap} from './map'
import {Tool, ToolFitMode, ToolCallbacks, toolMakerSequence} from './tools'
import {startOrResetFadeAnimation} from './util'

class ToolBroadcaster {
	private sources: Set<Tool> = new Set()
	constructor(private readonly tools: [tool:Tool,$tool:HTMLElement][]) {}
	broadcastTimestampChange(fromTool: Tool|null, timestamp: string): void {
		this.broadcast(fromTool,tool=>tool.onTimestampChange(timestamp))
	}
	broadcastNoteCountsChange(fromTool: Tool|null, nFetched: number, nVisible: number): void {
		this.broadcast(fromTool,tool=>tool.onNoteCountsChange(nFetched,nVisible))
	}
	broadcastSelectedNotesChange(fromTool: Tool|null, selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): void {
		this.broadcast(fromTool,tool=>tool.onSelectedNotesChange(selectedNotes,selectedNoteUsers))
	}
	private broadcast(fromTool: Tool|null, sendMessageToTool: (tool:Tool)=>boolean) {
		if (fromTool) {
			if (this.sources.has(fromTool)) return
			this.sources.add(fromTool)
		}
		for (const [tool,$tool] of this.tools) {
			if (this.sources.has(tool)) continue
			const reacted=sendMessageToTool(tool)
			if (reacted) startOrResetFadeAnimation($tool,'tool-ping-fade','ping')
		}
		if (fromTool) {
			this.sources.delete(fromTool)
		}
	}
}

export default class ToolPanel {
	private toolBroadcaster: ToolBroadcaster
	#fitMode: ToolFitMode
	constructor($container: HTMLElement, map: NoteMap, storage: NoteViewerStorage) {
		const tools: [tool:Tool,$tool:HTMLDetailsElement][] = []
		const toolCallbacks: ToolCallbacks = {
			onFitModeChange: (fromTool,fitMode)=>this.#fitMode=fitMode,
			onTimestampChange: (fromTool,timestamp)=>{
				this.toolBroadcaster.broadcastTimestampChange(fromTool,timestamp)
			},
			onToolOpenToggle: (fromTool: Tool, setToOpen: boolean)=>{
				for (const [,$tool] of tools) $tool.open=setToOpen
			}
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
			$toolDetails.addEventListener('animationend',toolAnimationEndListener)
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
			tools.push([tool,$toolDetails])
		}
		this.toolBroadcaster=new ToolBroadcaster(tools)
	}
	receiveNoteCounts(nFetched: number, nVisible: number) { // TODO receive one object with all/visible/selected notes
		this.toolBroadcaster.broadcastNoteCountsChange(null,nFetched,nVisible)
	}
	receiveSelectedNotes(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): void {
		this.toolBroadcaster.broadcastSelectedNotesChange(null,selectedNotes,selectedNoteUsers)
	}
	receiveTimestamp(timestamp: string): void {
		this.toolBroadcaster.broadcastTimestampChange(null,timestamp)
	}
	get fitMode(): ToolFitMode {
		return this.#fitMode
	}
}

function toolAnimationEndListener(this: HTMLElement) {
	this.classList.remove('ping')
}
