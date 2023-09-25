import type {Note} from '../data'
import type {SimpleStorage} from '../util/storage'
import type {Connection} from '../net'
import type NoteMap from '../map'
import {makeElement, startAnimation, cleanupAnimationOnEnd} from '../util/html'

export type ToolElements = Array<string|HTMLElement>

export abstract class Tool {
	public abstract readonly id: string
	public abstract readonly name: string
	public readonly title?: string
	public readonly isFullWidth: boolean = false
	private $buttonsRequiringSelectedNotes: HTMLButtonElement[] = []
	constructor(
		protected readonly storage: SimpleStorage,
		protected readonly cx: Connection
	){}
	write(
		$root: HTMLElement, map: NoteMap
	): [$tool: HTMLDetailsElement|null, $info: HTMLDetailsElement|null] {
		if (!this.isActiveWithCurrentServer()) return [null,null]
		const $tool=makeElement('details')('tool')()
		$tool.classList.toggle('full-width',this.isFullWidth)
		const $toolSummary=makeElement('summary')()(this.name)
		if (this.title) $toolSummary.title=this.title
		$tool.append($toolSummary,...this.getTool($root,$tool,map))
		cleanupAnimationOnEnd($tool)
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
			return [$tool,$info]
		} else {
			return [$tool,null]
		}
	}
	protected isActiveWithCurrentServer(): boolean { return true }
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
