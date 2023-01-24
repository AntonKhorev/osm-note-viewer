import NoteViewerStorage from './storage'
import Auth from './auth'
import GlobalEventsListener from './events'
import type {Note} from './data'
import NoteMap from './map'
import FigureDialog from './figure'
import {
	Tool, ToolFitMode, ToolCallbacks, toolMakerSequence,
	OverpassTurboTool, OverpassTool, StreetViewTool
} from './tools'
import {startOrResetFadeAnimation} from './html'

class ToolBroadcaster {
	private sources: Set<Tool> = new Set()
	constructor(private readonly tools: [tool:Tool,$tool:HTMLElement][]) {}
	broadcastRefresherStateChange(fromTool: Tool|null, isRunning: boolean, message: string|undefined): void {
		this.broadcast(fromTool,tool=>tool.onRefresherStateChange(isRunning,message))
	}
	broadcastRefresherPeriodChange(fromTool: Tool|null, refreshPeriod: number): void {
		this.broadcast(fromTool,tool=>tool.onRefresherPeriodChange(refreshPeriod))
	}
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
	#replaceUpdatedNotes: boolean = false
	onCommentsViewChange?: (onlyFirst:boolean,oneLine:boolean)=>void
	onRefresherStateChange?: (isRunning:boolean)=>void
	onRefresherPeriodChange?: (refreshPeriod:number)=>void
	onRefresherRefreshAll?: ()=>void
	constructor(
		storage: NoteViewerStorage, auth: Auth, globalEventsListener: GlobalEventsListener,
		$container: HTMLElement,
		map: NoteMap, figureDialog: FigureDialog
	) {
		const tools: [tool:Tool,$tool:HTMLDetailsElement][] = []
		const toolCallbacks: ToolCallbacks = {
			onFitModeChange: (fromTool,fitMode)=>this.#fitMode=fitMode,
			onCommentsViewChange: (fromTool,onlyFirst,oneLine)=>this.onCommentsViewChange?.(onlyFirst,oneLine),
			onRefresherStateChange: (fromTool,isRunning,message)=>this.onRefresherStateChange?.(isRunning),
			onRefresherRefreshChange: (fromTool,replaceUpdatedNotes)=>this.#replaceUpdatedNotes=replaceUpdatedNotes,
			onRefresherPeriodChange: (fromTool,refreshPeriod)=>this.onRefresherPeriodChange?.(refreshPeriod),
			onRefresherRefreshAll: (fromTool)=>this.onRefresherRefreshAll?.(),
			onTimestampChange: (fromTool,timestamp)=>{
				this.toolBroadcaster.broadcastTimestampChange(fromTool,timestamp)
			},
			onToolOpenToggle: (fromTool: Tool, setToOpen: boolean)=>{
				for (const [,$tool] of tools) $tool.open=setToOpen
			}
		}
		for (const makeTool of toolMakerSequence) {
			const tool=makeTool()
			if (!auth.server.overpassTurbo && tool instanceof OverpassTurboTool) continue
			if (!auth.server.overpass && tool instanceof OverpassTool) continue
			if (auth.server.world!='earth' && tool instanceof StreetViewTool) continue
			const storageKey='commands-'+tool.id
			const $toolDetails=document.createElement('details')
			$toolDetails.classList.add('tool')
			$toolDetails.classList.toggle('full-width',tool.isFullWidth)
			$toolDetails.open=storage.getBoolean(storageKey)
			const $toolSummary=document.createElement('summary')
			$toolSummary.textContent=tool.name
			if (tool.title) $toolSummary.title=tool.title
			$toolDetails.addEventListener('toggle',()=>{
				storage.setBoolean(storageKey,$toolDetails.open)
			})
			$toolDetails.append($toolSummary,...tool.getTool(toolCallbacks,auth,map,figureDialog))
			$toolDetails.addEventListener('animationend',toolAnimationEndListener)
			const infoElements=tool.getInfo()
			if (infoElements) {
				const $infoDetails=document.createElement('details')
				$infoDetails.classList.add('info')
				const $infoSummary=document.createElement('summary')
				$infoSummary.textContent=`${tool.name} info`
				$infoDetails.append($infoSummary,...infoElements)
				const $infoButton=document.createElement('button')
				$infoButton.classList.add('info')
				$infoButton.innerHTML=`<svg><title>Tool info</title><use href="#tools-info" /></svg>`
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
		globalEventsListener.timestampListener=(timestamp: string)=>{
			this.toolBroadcaster.broadcastTimestampChange(null,timestamp)
		}
	}
	receiveRefresherStateChange(isRunning: boolean, message: string|undefined) {
		this.toolBroadcaster.broadcastRefresherStateChange(null,isRunning,message)
	}
	receiveRefresherPeriodChange(refreshPeriod: number) {
		this.toolBroadcaster.broadcastRefresherPeriodChange(null,refreshPeriod)
	}
	receiveNoteCounts(nFetched: number, nVisible: number) { // TODO receive one object with all/visible/selected notes
		this.toolBroadcaster.broadcastNoteCountsChange(null,nFetched,nVisible)
	}
	receiveSelectedNotes(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): void {
		this.toolBroadcaster.broadcastSelectedNotesChange(null,selectedNotes,selectedNoteUsers)
	}
	get fitMode(): ToolFitMode {
		return this.#fitMode
	}
	get replaceUpdatedNotes(): boolean {
		return this.#replaceUpdatedNotes
	}
}

function toolAnimationEndListener(this: HTMLElement) {
	this.classList.remove('ping')
}
