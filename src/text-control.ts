import {makeElement, makeDiv} from './html'

export default class TextControl<T> {
	$controls: HTMLDivElement
	private $a: HTMLAnchorElement
	private textState: string|undefined
	constructor(
		$input: HTMLInputElement|HTMLTextAreaElement,
		private isVisible: ()=>boolean,
		private canUndoInput: (textState:string)=>boolean,
		undoInput: (textState:string)=>void,
		doInput: (textState:string,logicState:T,$a:HTMLAnchorElement)=>void,
		getState: ()=>Promise<[textState:string,logicState:T]>,
		private getUndoLabel: ()=>string,
		private getDoLabel: ()=>string
	) {
		this.$a=makeElement('a')('input-link')()
		this.$a.tabIndex=0
		this.$a.onclick=async()=>{
			if (this.textState!=null && this.canUndoInput(this.textState)) {
				undoInput(this.textState)
				this.textState=undefined
				this.updateControl()
			} else {
				try {
					const [textState,logicState]=await getState()
					doInput(textState,logicState,this.$a)
					this.textState=textState
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
			this.textState=undefined
			this.updateControl()
		}
		this.$controls.hidden=!toBeVisible
	}
	private updateControl(): void {
		this.$a.textContent=(this.textState!=null && this.canUndoInput(this.textState)
			? this.getUndoLabel()
			: this.getDoLabel()
		)
	}
}
