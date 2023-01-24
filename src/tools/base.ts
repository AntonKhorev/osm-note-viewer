import type {Note} from '../data'
import type Server from '../server'
import type NoteMap from '../map'
import type FigureDialog from '../figure'
import {makeElement} from '../html'

export type ToolElements = Array<string|HTMLElement>

export type ToolFitMode = 'allNotes' | 'selectedNotes' | 'inViewNotes' | undefined

export interface ToolCallbacks {
	onFitModeChange(fromTool: Tool, fitMode: ToolFitMode): void
	onCommentsViewChange(fromTool: Tool, onlyFirst: boolean, oneLine: boolean): void
	onRefresherStateChange(fromTool: Tool, isRunning: boolean, message: string|undefined): void
	onRefresherRefreshChange(fromTool: Tool, replaceUpdatedNotes: boolean): void
	onRefresherPeriodChange(fromTool: Tool, refreshPeriod: number): void
	onRefresherRefreshAll(fromTool: Tool): void
	onTimestampChange(fromTool: Tool, timestamp: string): void
	onToolOpenToggle(fromTool: Tool, setToOpen: boolean): void
}

export abstract class Tool {
	private $buttonsRequiringSelectedNotes: [$button:HTMLButtonElement,activationCondition:()=>boolean][] = []
	constructor(
		public readonly id: string,
		public readonly name: string,
		public readonly title?: string,
		public readonly isFullWidth=false
	) {}
	abstract getTool(callbacks: ToolCallbacks, server: Server, map: NoteMap, figureDialog: FigureDialog): ToolElements
	getInfo(): ToolElements|undefined { return undefined }
	onRefresherStateChange(isRunning: boolean, message: string|undefined): boolean { return false }
	onRefresherPeriodChange(refreshPeriod: number): boolean { return false }
	onTimestampChange(timestamp: string): boolean { return false }
	onNoteCountsChange(nFetched: number, nVisible: number): boolean { return false }
	onSelectedNotesChange(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): boolean {
		let reactedToButtons=false
		for (const [$button,activationCondition] of this.$buttonsRequiringSelectedNotes) {
			const newDisabled=selectedNotes.length<=0 || !activationCondition()
			if ($button.disabled!=newDisabled) {
				$button.disabled=newDisabled
				reactedToButtons=true
			}
		}
		const reactedToOthers=this.onSelectedNotesChangeWithoutHandlingButtons(selectedNotes,selectedNoteUsers)
		return reactedToButtons||reactedToOthers
	}
	protected onSelectedNotesChangeWithoutHandlingButtons(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): boolean { return false }
	protected makeRequiringSelectedNotesButton(activationCondition:()=>boolean = ()=>true): HTMLButtonElement {
		const $button=document.createElement('button')
		$button.disabled=true
		this.$buttonsRequiringSelectedNotes.push([$button,activationCondition])
		return $button
	}
}

export function makeMapIcon(type: string): HTMLElement {
	const $span=makeElement('span')(`icon-map-${type}`)()
	$span.innerHTML=`<svg><use href="#tools-map" /></svg><span>map ${type}</span>`
	return $span
}

export function makeNotesIcon(type: string): HTMLElement {
	const $span=makeElement('span')(`icon-notes-${type}`)()
	$span.innerHTML=`<svg><use href="#tools-notes" /></svg><span>${type} notes</span>`
	return $span
}

export function makeActionIcon(type: string, text: string): HTMLElement {
	const $span=makeElement('span')(`icon-action-${type}`)()
	$span.innerHTML=`<svg><use href="#tools-${type}" /></svg>`
	$span.append(makeElement('span')()(text))
	return $span
}
