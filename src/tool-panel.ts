import type NoteViewerStorage from './storage'
import type Auth from './auth'
import type GlobalEventsListener from './events'
import type {Note, Users} from './data'
import type NoteMap from './map'
import type FigureDialog from './figure'
import type {Tool, ToolFitMode, ToolCallbacks} from './tools'
import {toolMakerSequence} from './tools'

class ToolBroadcaster {
	private sources: Set<Tool> = new Set()
	constructor(private readonly tools: Tool[]) {}
	broadcastLoginChange(fromTool: Tool|null): void {
		this.broadcast(fromTool,tool=>tool.onLoginChange())
	}
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
		for (const tool of this.tools) {
			if (this.sources.has(tool)) continue
			sendMessageToTool(tool)
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
	onRefresherStateChange?: (isRunning:boolean)=>void
	onRefresherPeriodChange?: (refreshPeriod:number)=>void
	onRefresherRefreshAll?: ()=>void
	onNoteReload?: (note:Note,users:Users)=>void
	constructor(
		storage: NoteViewerStorage, auth: Auth, globalEventsListener: GlobalEventsListener,
		$container: HTMLElement,
		map: NoteMap, figureDialog: FigureDialog
	) {
		const tools: Tool[] = []
		const toolCallbacks: ToolCallbacks = {
			onFitModeChange: (fromTool,fitMode)=>this.#fitMode=fitMode,
			onRefresherStateChange: (fromTool,isRunning,message)=>this.onRefresherStateChange?.(isRunning),
			onRefresherRefreshChange: (fromTool,replaceUpdatedNotes)=>this.#replaceUpdatedNotes=replaceUpdatedNotes,
			onRefresherPeriodChange: (fromTool,refreshPeriod)=>this.onRefresherPeriodChange?.(refreshPeriod),
			onRefresherRefreshAll: (fromTool)=>this.onRefresherRefreshAll?.(),
			onTimestampChange: (fromTool,timestamp)=>{
				this.toolBroadcaster.broadcastTimestampChange(fromTool,timestamp)
			},
			onToolOpenToggle: (fromTool: Tool, setToOpen: boolean)=>{
				for (const $toolDetails of  $container.querySelectorAll('details.tool')) {
					if (!($toolDetails instanceof HTMLDetailsElement)) continue
					$toolDetails.open=setToOpen
				}
			},
			onNoteReload: (fromTool,note,users)=>this.onNoteReload?.(note,users)
		}
		for (const makeTool of toolMakerSequence) {
			const tool=makeTool(auth)
			tool.write(storage,$container,toolCallbacks,map,figureDialog)
			tools.push(tool)
		}
		this.toolBroadcaster=new ToolBroadcaster(tools)
		globalEventsListener.timestampListener=(timestamp: string)=>{
			this.toolBroadcaster.broadcastTimestampChange(null,timestamp)
		}
	}
	receiveLoginChange() {
		this.toolBroadcaster.broadcastLoginChange(null)
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
