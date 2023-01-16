import {hideElement, unhideElement} from "./html"

export default class ConfirmedButtonListener {
	constructor(
		private $initButton: HTMLButtonElement,
		private $cancelButton: HTMLButtonElement,
		private $confirmButton: HTMLButtonElement,
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
		unhideElement(this.$initButton)
		hideElement(this.$confirmButton)
		hideElement(this.$cancelButton)
	}
	private ask() {
		hideElement(this.$initButton)
		unhideElement(this.$confirmButton)
		unhideElement(this.$cancelButton)
	}
}
