import {Tool, ToolElements, ToolCallbacks, makeActionIcon} from './base'
import {makeElement, makeLabel} from '../html'

export class RefreshTool extends Tool {
	id='refresh'
	name=`Refresh notes`
	title=`Control automatic and manual refreshing of notes`
	private isRunning=true
	private $runButton=makeElement('button')('only-with-icon')()
	private $refreshPeriodInput=document.createElement('input')
	getTool(callbacks: ToolCallbacks): ToolElements {
		this.updateState(true)
		const $refreshSelect=makeElement('select')()(
			new Option('report'),
			new Option('replace')
		)
		this.$refreshPeriodInput.type='number'
		this.$refreshPeriodInput.min='1'
		this.$refreshPeriodInput.size=5
		this.$refreshPeriodInput.step='any'
		const $refreshAllButton=makeElement('button')('only-with-icon')(makeActionIcon('refresh',`Refresh now`))
		$refreshAllButton.title=`Refresh all notes currently on the screen in the table above`
		this.$runButton.onclick=()=>{
			const newIsRunning=!this.isRunning
			this.updateState(newIsRunning)
			callbacks.onRefresherStateChange(this,newIsRunning,undefined)
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
			callbacks.onRefresherPeriodChange(this,minutes*60*1000)
		}
		$refreshAllButton.onclick=()=>{
			callbacks.onRefresherRefreshAll(this)
		}
		return [
			this.$runButton,` `,
			makeLabel('inline')($refreshSelect,` updated notes`),` `,
			makeLabel('inline')(`every `,this.$refreshPeriodInput),` min. or `,
			$refreshAllButton
		]
	}
	onRefresherStateChange(isRunning: boolean, message: string|undefined): boolean {
		this.updateState(isRunning,message)
		return true
	}
	onRefresherPeriodChange(refreshPeriod: number): boolean {
		let minutes=(refreshPeriod/(60*1000)).toFixed(2)
		if (minutes.includes('.')) {
			minutes=minutes.replace(/\.?0+$/,'')
		}
		this.$refreshPeriodInput.value=minutes
		return true
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
