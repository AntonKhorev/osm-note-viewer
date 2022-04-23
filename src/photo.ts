// simple HTMLDialogElement interface to shut up TypeScript
// https://gist.github.com/jbmoelker/226594f195b97bf61436
interface HTMLDialogElementHack extends HTMLDialogElement {
	open: boolean
	returnValue: string
	close(): void
	show(): void
	showModal(): void
}

export default class PhotoDialog {
	private url: string|undefined
	private fallbackMode: boolean
	constructor(private $dialog: HTMLDialogElement) {
		this.fallbackMode=((window as any).HTMLDialogElement == null)
	}
	toggle(url: string) {
		const $dialog = <HTMLDialogElementHack>this.$dialog
		if (this.fallbackMode) {
			return open(url,'photo')
		}
		this.$dialog.innerHTML=''
		if (url==this.url) {
			$dialog.close()
			this.url=undefined
		} else {
			const $figure=document.createElement('figure')
			$figure.addEventListener('click',figureClickListener)
			// TODO close button
			const $img=document.createElement('img')
			$img.src=url
			$img.alt='attached photo'
			$figure.append($img)
			$dialog.append($figure)
			$dialog.show()
			this.url=url
		}
	}
}

function figureClickListener(this: HTMLElement): void {
	this.classList.toggle('zoomed')
}
