import type {Note} from '../data'
import Server from '../server'
import NoteMap from '../map'
import FigureDialog from '../figure'

export type ToolElements = Array<string|HTMLElement>

export type ToolFitMode = 'allNotes' | 'selectedNotes' | 'inViewNotes' | undefined

export interface ToolCallbacks {
	onFitModeChange(fromTool: Tool, fitMode: ToolFitMode): void
	onCommentsViewChange(fromTool: Tool, onlyFirst: boolean, oneLine: boolean): void
	onTimestampChange(fromTool: Tool, timestamp: string): void
	onToolOpenToggle(fromTool: Tool, setToOpen: boolean): void
	onRefresherRun(fromTool: Tool): void
	onRefresherStop(fromTool: Tool): void
}

export abstract class Tool {
	private $buttonsRequiringSelectedNotes: HTMLButtonElement[] = []
	constructor(public id: string, public name: string, public title?: string ) {}
	abstract getTool(callbacks: ToolCallbacks, server: Server, map: NoteMap, figureDialog: FigureDialog): ToolElements
	getInfo(): ToolElements|undefined { return undefined }
	onTimestampChange(timestamp: string): boolean { return false }
	onNoteCountsChange(nFetched: number, nVisible: number): boolean { return false }
	onSelectedNotesChange(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): boolean {
		let reactedToButtons=false
		if (this.$buttonsRequiringSelectedNotes.length>0) {
			for (const $button of this.$buttonsRequiringSelectedNotes) {
				$button.disabled=selectedNotes.length<=0
			}
			reactedToButtons=true
		}
		const reactedToOthers=this.onSelectedNotesChangeWithoutHandlingButtons(selectedNotes,selectedNoteUsers)
		return reactedToButtons||reactedToOthers
	}
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): boolean { return false }
	protected makeRequiringSelectedNotesButton(): HTMLButtonElement {
		const $button=document.createElement('button')
		$button.disabled=true
		this.$buttonsRequiringSelectedNotes.push($button)
		return $button
	}
}

export function makeMapIcon(type: string): HTMLElement {
	const $span=document.createElement('span')
	$span.innerHTML=`<span class='icon-map-${type}'><svg><use href="#tools-map" /></svg><span>map ${type}</span></span>`
	return $span
}

export function makeNotesIcon(type: string): HTMLElement {
	const $span=document.createElement('span')
	$span.innerHTML=`<span class='icon-notes-${type}'><svg><use href="#tools-notes" /></svg><span>${type} notes</span></span>`
	return $span
}
