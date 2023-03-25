import type {Note} from '../data'
import type NoteViewerStorage from '../storage'
import type Auth from '../auth'
import type NoteMap from '../map'
import {makeElement, startAnimation, cleanupAnimationOnEnd} from '../html'

export type ToolElements = Array<string|HTMLElement>

export abstract class Tool {
	public abstract readonly id: string
	public abstract readonly name: string
	public readonly title?: string
	public readonly isFullWidth: boolean = false
	private $buttonsRequiringSelectedNotes: HTMLButtonElement[] = []
	constructor(
		protected readonly auth: Auth
	){}
	write(
		$root: HTMLElement, $container: HTMLElement,
		storage: NoteViewerStorage, map: NoteMap
	) {
		if (!this.isActiveWithCurrentServer()) return
		const storageKey='commands-'+this.id
		const $tool=makeElement('details')('tool')()
		$tool.classList.toggle('full-width',this.isFullWidth)
		$tool.open=storage.getBoolean(storageKey)
		const $toolSummary=makeElement('summary')()(this.name)
		if (this.title) $toolSummary.title=this.title
		$tool.addEventListener('toggle',()=>{
			storage.setBoolean(storageKey,$tool.open)
		})
		$tool.append($toolSummary,...this.getTool($root,$tool,map))
		cleanupAnimationOnEnd($tool)
		$container.append($tool)
		const infoElements=this.getInfo()
		if (infoElements) {
			const $info=makeElement('details')('info')(
				makeElement('summary')()(`${this.name} info`),
				...infoElements
			)
			const $infoButton=makeElement('button')('info')()
			$infoButton.innerHTML=`<svg><use href="#tools-info" /></svg>`
			const updateInfoButton=()=>{
				$infoButton.title=($info.open?`Close`:`Open`)+` tool info`
				$infoButton.setAttribute('aria-expanded',String($info.open))
			}
			updateInfoButton()
			$infoButton.onclick=()=>{
				$info.open=!$info.open
			}
			$info.ontoggle=()=>{
				updateInfoButton()
			}
			$tool.addEventListener('toggle',()=>{
				if ($tool.open) return
				$info.open=false
			})
			const $infoButtonContainer=this.getInfoButtonContainer()
			if ($infoButtonContainer) {
				$infoButtonContainer.append($infoButton)
			} else {
				$tool.append(` `,$infoButton)
			}
			$container.append($info)
		}
		$root.addEventListener('osmNoteViewer:toolsToggle',ev=>{
			if (ev.target==$tool) return
			$tool.open=ev.detail
			this.ping($tool)
		})
		$root.addEventListener('osmNoteViewer:notesInput',ev=>{
			const [inputNotes]=ev.detail
			let reactedToButtons=false
			for (const $button of this.$buttonsRequiringSelectedNotes) {
				const newDisabled=inputNotes.length<=0
				if ($button.disabled!=newDisabled) {
					$button.disabled=newDisabled
					reactedToButtons=true
				}
			}
			if (reactedToButtons) this.ping($tool)
		})
	}
	isActiveWithCurrentServer(): boolean { return true }
	protected abstract getTool(
		$root: HTMLElement, $tool: HTMLElement,
		map: NoteMap
	): ToolElements
	protected getInfo(): ToolElements|undefined { return undefined }
	protected getInfoButtonContainer(): HTMLElement|undefined { return undefined }
	protected makeRequiringSelectedNotesButton(): HTMLButtonElement {
		const $button=document.createElement('button')
		$button.disabled=true
		this.$buttonsRequiringSelectedNotes.push($button)
		return $button
	}
	protected ping($tool: HTMLElement) {
		startAnimation($tool,'tool-ping-fade','1s')
	}
}

export function makeMapIcon(type: string): HTMLElement {
	const $span=makeElement('span')(`icon-map-${type}`)()
	$span.title=`map ${type}`
	$span.innerHTML=`<svg><use href="#tools-map" /></svg>`
	return $span
}

export function makeNotesIcon(type: string): HTMLElement {
	const $span=makeElement('span')(`icon-notes-${type}`)()
	$span.title=`${type} notes`
	$span.innerHTML=`<svg><use href="#tools-notes" /></svg>`
	return $span
}

export function makeActionIcon(type: string, text: string): HTMLElement {
	const $span=makeElement('span')(`icon-action-${type}`)()
	$span.title=text
	$span.innerHTML=`<svg><use href="#tools-${type}" /></svg>`
	return $span
}

export function makeNoteStatusIcon(status: Note['status'], number = 1): HTMLElement {
	const height=16
	const width=8
	const r=width/2
	const $span=makeElement('span')(`icon-note-status`)()
	$span.title=`${status} note${number!=1?`s`:``}`
	const path=`<path d="${computeMarkerOutlinePath(height,width/2-.5)}" stroke="gray" ${pathAttrs()} />`
	$span.innerHTML=`<svg viewBox="${-r} ${-r} ${width} ${height}">${path}</svg>`
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
