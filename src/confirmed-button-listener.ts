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
				this.$cancelButton.focus()
			} else {
				await runAction()
			}
		}
		$cancelButton.onclick=()=>{
			this.reset()
			this.$initButton.focus()
		}
		$confirmButton.onclick=async()=>{
			await runAction()
			this.reset()
			this.$initButton.focus()
		}
	}
	reset() {
		clearTimeout(this.confirmDelayId)
		this.$confirmButton.disabled=true
		this.$initButton.hidden=false
		this.$confirmButton.hidden=true
		this.$cancelButton.hidden=true
	}
	private ask() {
		this.confirmDelayId=setTimeout(()=>{
			this.$confirmButton.disabled=false
		},1000)
		this.$initButton.hidden=true
		this.$confirmButton.hidden=false
		this.$cancelButton.hidden=false
	}
}
