import type NoteViewerStorage from './storage'
import type Auth from './auth'
import type NoteMap from './map'
import type {Tool, ToolCallbacks} from './tools'
import {toolMakerSequence} from './tools'

export default class ToolPanel {
	#replaceUpdatedNotes: boolean = false
	onRefresherRefreshAll?: ()=>void
	constructor(
		$root: HTMLElement, $container: HTMLElement,
		storage: NoteViewerStorage, auth: Auth,
		map: NoteMap
	) {
		const tools: Tool[] = []
		const toolCallbacks: ToolCallbacks = {
			onRefresherRefreshChange: (fromTool,replaceUpdatedNotes)=>this.#replaceUpdatedNotes=replaceUpdatedNotes,
			onRefresherRefreshAll: (fromTool)=>this.onRefresherRefreshAll?.(),
		}
		for (const makeTool of toolMakerSequence) {
			const tool=makeTool(auth)
			tool.write($root,$container,storage,toolCallbacks,map)
			tools.push(tool)
		}
	}
	get replaceUpdatedNotes(): boolean {
		return this.#replaceUpdatedNotes
	}
}
