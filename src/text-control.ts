import {makeElement, makeDiv} from './html'

export default class TextControl {
	$controls: HTMLDivElement
	private $a: HTMLAnchorElement
	private state: string|undefined
	constructor(
		$input: HTMLInputElement|HTMLTextAreaElement,
		private isVisible: ()=>boolean,
		private isEnabled: (state:string|undefined)=>boolean,
		private canUndoInput: (state:string)=>boolean,
		undoInput: (textState:string)=>void,
		doInput: ($a:HTMLAnchorElement)=>Promise<string>,
		private getUndoLabel: ()=>(string|HTMLElement)[],
		private getDoLabel: ()=>(string|HTMLElement)[]
	) {
		this.$a=makeElement('a')('input-link')()
		this.$a.onclick=async()=>{
			if (!this.$a.hasAttribute('tabindex')) return
			if (this.state!=null && this.canUndoInput(this.state)) {
				undoInput(this.state)
				this.state=undefined
				this.updateControl()
			} else {
				try {
					this.state=await doInput(this.$a)
					this.updateControl()
				} catch {}
			}
		}
		this.$a.onkeydown=ev=>{
			if (ev.key!='Enter') return
			this.$a.click()
			ev.preventDefault()
			ev.stopPropagation()
		}
		$input.addEventListener('input',()=>{
			if (this.$controls.hidden) return
			this.updateControl()
		})
		this.$controls=makeDiv('text-controls')(this.$a)
		this.$controls.hidden=true
		this.update()
	}
	update(): void {
		const toBeVisible=this.isVisible()
		if (toBeVisible && this.$controls.hidden) {
			this.state=undefined
			this.updateControl()
		}
		this.$controls.hidden=!toBeVisible
	}
	private updateControl(): void {
		if (this.isEnabled(this.state)) {
			this.$a.setAttribute('tabindex','0')
		} else {
			this.$a.removeAttribute('tabindex')
		}
		this.$a.replaceChildren(...(this.state!=null && this.canUndoInput(this.state)
			? this.getUndoLabel()
			: this.getDoLabel()
		))
	}
}
