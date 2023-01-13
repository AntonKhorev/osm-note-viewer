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
		unhide(this.$initButton)
		hide(this.$confirmButton)
		hide(this.$cancelButton)
	}
	private ask() {
		hide(this.$initButton)
		unhide(this.$confirmButton)
		unhide(this.$cancelButton)
	}
}

function hide($e:HTMLElement) {
	$e.style.display='none'
}
function unhide($e:HTMLElement) {
	$e.style.removeProperty('display')
}
