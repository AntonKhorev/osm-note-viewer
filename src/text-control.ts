import {makeElement} from './html'

export default class TextControl<T> {
	$a: HTMLAnchorElement
	private textState: string|undefined
	constructor(
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
				this.update()
			} else {
				try {
					const [textState,logicState]=await getState()
					doInput(textState,logicState,this.$a)
					this.textState=textState
					this.update()
				} catch {}
			}
		}
		this.$a.onkeydown=ev=>{
			if (ev.key!='Enter') return
			this.$a.click()
			ev.preventDefault()
			ev.stopPropagation()
		}
		this.update()
	}
	update(): void {
		this.$a.textContent=(this.textState!=null && this.canUndoInput(this.textState)
			? this.getUndoLabel()
			: this.getDoLabel()
		)
	}
}
