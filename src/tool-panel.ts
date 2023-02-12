import type NoteViewerStorage from './storage'
import type Auth from './auth'
import type NoteMap from './map'
import type {Tool, ToolCallbacks} from './tools'
import {toolMakerSequence} from './tools'

export default class ToolPanel {
	constructor(
		$root: HTMLElement, $container: HTMLElement,
		storage: NoteViewerStorage, auth: Auth,
		map: NoteMap
	) {
		const tools: Tool[] = []
		const toolCallbacks: ToolCallbacks = {}
		for (const makeTool of toolMakerSequence) {
			const tool=makeTool(auth)
			tool.write($root,$container,storage,toolCallbacks,map)
			tools.push(tool)
		}
	}
}
