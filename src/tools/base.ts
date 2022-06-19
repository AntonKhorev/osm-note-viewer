import type {Note} from '../data'
import {NoteMap} from '../map'
import FigureDialog from '../figure'

export type ToolElements = Array<string|HTMLElement>

export type ToolFitMode = 'allNotes' | 'inViewNotes' | undefined

export interface ToolCallbacks {
	onFitModeChange(fromTool: Tool, fitMode: ToolFitMode): void
	onTimestampChange(fromTool: Tool, timestamp: string): void
	onToolOpenToggle(fromTool: Tool, setToOpen: boolean): void
}

export abstract class Tool {
	private $buttonsRequiringSelectedNotes: HTMLButtonElement[] = []
	constructor(public id: string, public name: string, public title?: string ) {}
	abstract getTool(callbacks: ToolCallbacks, map: NoteMap, figureDialog: FigureDialog): ToolElements
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

export function makeMapIcon(type: string): HTMLImageElement {
	const $img=document.createElement('img')
	$img.classList.add('icon')
	$img.src=`map-${type}.svg`
	$img.width=19
	$img.height=13
	$img.alt=`map ${type}`
	return $img
}

export function makeNotesIcon(type: string): HTMLImageElement {
	const $img=document.createElement('img')
	$img.classList.add('icon')
	$img.src=`notes-${type}.svg`
	$img.width=9
	$img.height=13
	$img.alt=`${type} notes`
	return $img
}
