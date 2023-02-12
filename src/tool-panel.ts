import type NoteViewerStorage from './storage'
import type Auth from './auth'
import type NoteMap from './map'
import type {Tool} from './tools'
import {toolMakerSequence} from './tools'

export default class ToolPanel {
	constructor(
		$root: HTMLElement, $container: HTMLElement,
		storage: NoteViewerStorage, auth: Auth,
		map: NoteMap
	) {
		const tools: Tool[] = []
		for (const makeTool of toolMakerSequence) {
			const tool=makeTool(auth)
			tool.write($root,$container,storage,map)
			tools.push(tool)
		}
	}
}
