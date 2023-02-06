import type {Note, Users} from '../data'
import type Auth from '../auth'
import type NoteMap from '../map'
import type FigureDialog from '../figure'
import {makeElement} from '../html'

export type ToolElements = Array<string|HTMLElement>

export type ToolFitMode = 'allNotes' | 'selectedNotes' | 'inViewNotes' | undefined

export interface ToolCallbacks {
	onFitModeChange(fromTool: Tool, fitMode: ToolFitMode): void
	onRefresherStateChange(fromTool: Tool, isRunning: boolean, message: string|undefined): void
	onRefresherRefreshChange(fromTool: Tool, replaceUpdatedNotes: boolean): void
	onRefresherPeriodChange(fromTool: Tool, refreshPeriod: number): void
	onRefresherRefreshAll(fromTool: Tool): void
	onTimestampChange(fromTool: Tool, timestamp: string): void
	onToolOpenToggle(fromTool: Tool, setToOpen: boolean): void
	onNoteReload(fromTool: Tool, note: Note, users: Users): void
}

export abstract class Tool {
	public abstract readonly id: string
	public abstract readonly name: string
	public readonly title?: string
	public readonly isFullWidth: boolean = false
	private $buttonsRequiringSelectedNotes: HTMLButtonElement[] = []
	constructor(
		protected readonly auth: Auth
	){}
	abstract getTool(callbacks: ToolCallbacks, map: NoteMap, figureDialog: FigureDialog): ToolElements
	getInfo(): ToolElements|undefined { return undefined }
	onLoginChange(): boolean { return false }
	onRefresherStateChange(isRunning: boolean, message: string|undefined): boolean { return false }
	onRefresherPeriodChange(refreshPeriod: number): boolean { return false }
	onTimestampChange(timestamp: string): boolean { return false }
	onNoteCountsChange(nFetched: number, nVisible: number): boolean { return false }
	onSelectedNotesChange(selectedNotes: ReadonlyArray<Note>, selectedNoteUsers: ReadonlyMap<number,string>): boolean {
		let reactedToButtons=false
		for (const $button of this.$buttonsRequiringSelectedNotes) {
			const newDisabled=selectedNotes.length<=0
			if ($button.disabled!=newDisabled) {
				$button.disabled=newDisabled
				reactedToButtons=true
			}
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

export function makeNoteStatusIcon(status: Note['status'], number = 1): HTMLElement {
	const height=16
	const width=8
	const r=width/2
	const $span=makeElement('span')(`icon-note-status`)()
	const path=`<path d="${computeMarkerOutlinePath(height,width/2-.5)}" stroke="gray" ${pathAttrs()} />`
	$span.innerHTML=`<svg viewBox="${-r} ${-r} ${width} ${height}">${path}</svg><span>${status} note${number!=1?`s`:``}</span>`
	return $span
	function pathAttrs() {
		if (status=='open') {
			return `fill="red"`
		} else if (status=='closed') {
			return `fill="green"`
		} else {
			return `fill="#444"`
		}
	}
	// copypaste from marker.ts
	function computeMarkerOutlinePath(height: number, r: number): string {
		const rp=height-r
		const y=r**2/rp
		const x=Math.sqrt(r**2-y**2)
		const xf=x.toFixed(2)
		const yf=y.toFixed(2)
		return `M0,${rp} L-${xf},${yf} A${r},${r} 0 1 1 ${xf},${yf} Z`
	}
}
