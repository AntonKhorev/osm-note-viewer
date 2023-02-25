import {makeElement, makeDiv} from './html'

export default class TextControl {
	$controls: HTMLDivElement
	private $a: HTMLAnchorElement
	private textState: string|undefined
	constructor(
		$input: HTMLInputElement|HTMLTextAreaElement,
		private isVisible: ()=>boolean,
		private canDoWithoutTextState: ()=>boolean,
		private canDoWithTextState: (textState:string)=>boolean,
		undoInput: (textState:string)=>void,
		doInput: ($a:HTMLAnchorElement)=>Promise<string>,
		private getUndoLabel: ()=>(string|HTMLElement)[],
		private getDoLabel: ()=>(string|HTMLElement)[]
	) {
		this.$a=makeElement('a')('input-link')()
		this.$a.onclick=async()=>{
			if (this.canUndo(this.textState)) {
				undoInput(this.textState)
				this.textState=undefined
				this.updateControl()
			} else if (this.canDo(this.textState)) {
				try {
					this.$a.classList.add('loading')
					this.textState=await doInput(this.$a)
					this.updateControl()
				} finally {
					this.$a.classList.remove('loading')
				}
				return
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
			this.textState=undefined
			this.updateControl()
		}
		this.$controls.hidden=!toBeVisible
	}
	private updateControl(): void {
		const canUndo=this.canUndo(this.textState)
		const canDo=this.canDo(this.textState)
		if (canUndo || canDo) {
			this.$a.setAttribute('tabindex','0')
		} else {
			this.$a.removeAttribute('tabindex')
		}
		this.$a.replaceChildren(...(canUndo
			? this.getUndoLabel()
			: this.getDoLabel()
		))
	}
	private canUndo(textState: string|undefined): textState is string {
		return textState!=null && !this.canDoWithTextState(textState)
	}
	private canDo(textState: string|undefined) {
		return textState!=null ? this.canDoWithTextState(textState) : this.canDoWithoutTextState()
	}
}
