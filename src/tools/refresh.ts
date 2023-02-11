import {Tool, ToolElements, ToolCallbacks, makeActionIcon} from './base'
import {bubbleCustomEvent, makeElement, makeLabel} from '../html'

export class RefreshTool extends Tool {
	id='refresh'
	name=`Refresh`
	title=`Control automatic and manual refreshing of notes`
	private isRunning=true
	private $runButton=makeElement('button')('only-with-icon')()
	private $refreshPeriodInput=document.createElement('input')
	protected getTool($root: HTMLElement, $tool: HTMLElement, callbacks: ToolCallbacks): ToolElements {
		this.updateState(true)
		const $refreshSelect=makeElement('select')()(
			new Option('report'),
			new Option('replace')
		)
		this.$refreshPeriodInput.type='number'
		this.$refreshPeriodInput.min='1'
		this.$refreshPeriodInput.size=5
		this.$refreshPeriodInput.step='any'
		this.$refreshPeriodInput.value='5' // TODO this is a hack: this value should correspond to the one in NoteTableAndRefresherConnector
		const $refreshAllButton=makeElement('button')('only-with-icon')(makeActionIcon('refresh',`Refresh now`))
		$refreshAllButton.title=`Refresh all notes currently on the screen in the table above`
		this.$runButton.onclick=()=>{
			const newIsRunning=!this.isRunning
			this.updateState(newIsRunning)
			bubbleCustomEvent($tool,'osmNoteViewer:changeRefresherState',[newIsRunning,undefined])
		}
		$refreshSelect.onchange=()=>{
			callbacks.onRefresherRefreshChange(this,
				$refreshSelect.value=='replace'
			)
		}
		this.$refreshPeriodInput.oninput=()=>{
			const str=this.$refreshPeriodInput.value
			if (!str) return
			const minutes=Number(str)
			if (!Number.isFinite(minutes) || minutes<=0) return
			bubbleCustomEvent($tool,'osmNoteViewer:changeRefresherPeriod',minutes*60*1000)
		}
		$refreshAllButton.onclick=()=>{
			callbacks.onRefresherRefreshAll(this)
		}
		$root.addEventListener('osmNoteViewer:changeRefresherState',ev=>{
			if (ev.target==$tool) return
			const [isRunning,message]=ev.detail
			this.updateState(isRunning,message)
			this.ping($tool)
		})
		return [
			this.$runButton,` `,
			makeLabel('inline')($refreshSelect,` updated notes`),` `,
			makeLabel('inline')(`every `,this.$refreshPeriodInput),` min. or `,
			$refreshAllButton
		]
	}
	private updateState(isRunning: boolean, message?: string) {
		this.isRunning=isRunning
		if (message==null) {
			this.$runButton.classList.remove('error')
			this.$runButton.title=(isRunning?`Halt`:`Resume`)+` note auto refreshing`
		} else {
			this.$runButton.classList.add('error')
			this.$runButton.title=message
		}
		this.$runButton.replaceChildren(isRunning
			? makeActionIcon('pause',`Halt`)
			: makeActionIcon('play',`Resume`)
		)
	}
}
