import type NoteViewerStorage from './storage'
import type Auth from './auth'
import type {Note, Users} from './data'
import type NoteMap from './map'
import type {Tool, ToolCallbacks} from './tools'
import {toolMakerSequence} from './tools'

class ToolBroadcaster {
	private sources: Set<Tool> = new Set()
	constructor(private readonly tools: Tool[]) {}
	broadcastRefresherStateChange(fromTool: Tool|null, isRunning: boolean, message: string|undefined): void {
		this.broadcast(fromTool,tool=>tool.onRefresherStateChange(isRunning,message))
	}
	broadcastRefresherPeriodChange(fromTool: Tool|null, refreshPeriod: number): void {
		this.broadcast(fromTool,tool=>tool.onRefresherPeriodChange(refreshPeriod))
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
	#replaceUpdatedNotes: boolean = false
	onRefresherStateChange?: (isRunning:boolean)=>void
	onRefresherPeriodChange?: (refreshPeriod:number)=>void
	onRefresherRefreshAll?: ()=>void
	onNoteReload?: (note:Note,users:Users)=>void
	constructor(
		$root: HTMLElement, $container: HTMLElement,
		storage: NoteViewerStorage, auth: Auth,
		map: NoteMap
	) {
		const tools: Tool[] = []
		const toolCallbacks: ToolCallbacks = {
			onRefresherStateChange: (fromTool,isRunning,message)=>this.onRefresherStateChange?.(isRunning),
			onRefresherRefreshChange: (fromTool,replaceUpdatedNotes)=>this.#replaceUpdatedNotes=replaceUpdatedNotes,
			onRefresherPeriodChange: (fromTool,refreshPeriod)=>this.onRefresherPeriodChange?.(refreshPeriod),
			onRefresherRefreshAll: (fromTool)=>this.onRefresherRefreshAll?.(),
			onNoteReload: (fromTool,note,users)=>this.onNoteReload?.(note,users)
		}
		for (const makeTool of toolMakerSequence) {
			const tool=makeTool(auth)
			tool.write($root,$container,storage,toolCallbacks,map)
			tools.push(tool)
		}
		this.toolBroadcaster=new ToolBroadcaster(tools)
	}
	receiveRefresherStateChange(isRunning: boolean, message: string|undefined) {
		this.toolBroadcaster.broadcastRefresherStateChange(null,isRunning,message)
	}
	receiveRefresherPeriodChange(refreshPeriod: number) {
		this.toolBroadcaster.broadcastRefresherPeriodChange(null,refreshPeriod)
	}
	get replaceUpdatedNotes(): boolean {
		return this.#replaceUpdatedNotes
	}
}
