export default class PhotoDialog {
	private url: string|undefined
	constructor($dialog: HTMLDialogElement) {
		// TODO detect if HTMLDialogElement is defined - if not, replace everything with dummy functions
	}
	toggle(url: string) {
		console.log('toggle photo',url) ///
		if (url==this.url) {
			// TODO close dialog
			this.url=undefined
		} else {
			// TODO open dialog and show photo
			this.url=url
		}
	}
}
