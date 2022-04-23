import {resetFadeAnimation} from './util'

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
	close() {
		const $dialog = <HTMLDialogElementHack>this.$dialog
		$dialog.close()
		this.url=undefined
	}
	toggle(url: string) {
		const $dialog = <HTMLDialogElementHack>this.$dialog
		if (this.fallbackMode) {
			return open(url,'photo')
		}
		this.$dialog.innerHTML=''
		if (url==this.url) {
			this.close()
			return
		}
		const $figure=document.createElement('figure')
		const $backdrop=document.createElement('div')
		$backdrop.classList.add('backdrop')
		$backdrop.style.backgroundImage=`url(${url})`
		const $img=document.createElement('img')
		$img.src=url
		$img.alt='attached photo'
		$figure.append($backdrop,$img)
		const $closeButton=document.createElement('button')
		$closeButton.title=`Close photo`
		$dialog.append($figure,$closeButton)

		$figure.addEventListener('click',()=>{
			$figure.classList.toggle('zoomed')
		})
		$figure.addEventListener('mousemove',(ev)=>{
			if ($closeButton.classList.contains('fading')) {
				resetFadeAnimation($closeButton,'photo-button-fade')
			} else {
				$closeButton.classList.add('fading')
			}
		})
		$closeButton.addEventListener('click',()=>{
			this.close()
		})
		$closeButton.addEventListener('animationend',()=>{
			$closeButton.classList.remove('fading')
		})

		$dialog.show()
		this.url=url
	}
}
