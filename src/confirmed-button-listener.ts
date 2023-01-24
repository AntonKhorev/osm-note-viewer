import {hideElement, unhideElement} from "./html"

export default class ConfirmedButtonListener {
	private confirmDelayId?: number
	constructor(
		private readonly $initButton: HTMLButtonElement,
		private readonly $cancelButton: HTMLButtonElement,
		private readonly $confirmButton: HTMLButtonElement,
		runAction: ()=>Promise<void>,
		isConfirmationRequired: ()=>boolean = ()=>true
	) {
		this.reset()
		$initButton.onclick=async()=>{
			if (isConfirmationRequired()) {
				this.ask()
			} else {
				await runAction()
			}
		}
		$cancelButton.onclick=()=>{
			this.reset()
		}
		$confirmButton.onclick=async()=>{
			await runAction()
			this.reset()
		}
	}
	reset() {
		clearTimeout(this.confirmDelayId)
		this.$confirmButton.disabled=true
		unhideElement(this.$initButton)
		hideElement(this.$confirmButton)
		hideElement(this.$cancelButton)
	}
	private ask() {
		this.confirmDelayId=setTimeout(()=>{
			this.$confirmButton.disabled=false
		},1000)
		hideElement(this.$initButton)
		unhideElement(this.$confirmButton)
		unhideElement(this.$cancelButton)
	}
}
