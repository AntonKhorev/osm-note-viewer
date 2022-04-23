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
	close(): void {
		const $dialog = <HTMLDialogElementHack>this.$dialog
		$dialog.close()
		this.url=undefined
	}
	toggle(url: string): void {
		const $dialog = <HTMLDialogElementHack>this.$dialog
		if (this.fallbackMode) {
			open(url,'photo')
			return
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

		$figure.addEventListener('click',(ev)=>{
			if ($figure.classList.contains('zoomed')) {
				$figure.classList.remove('zoomed')
			} else {
				const clamp=(num:number)=>Math.min(Math.max(num,0),1)
				let xScrollFraction=(ev.offsetX>=$figure.offsetWidth /2 ? 1 : 0)
				let yScrollFraction=(ev.offsetY>=$figure.offsetHeight/2 ? 1 : 0)
				if (ev.target==$img) {
					xScrollFraction=clamp(ev.offsetX/$img.offsetWidth)
					yScrollFraction=clamp(ev.offsetY/$img.offsetHeight)
				}
				$figure.classList.add('zoomed')
				const xMaxScrollDistance=$figure.scrollWidth -$figure.clientWidth
				const yMaxScrollDistance=$figure.scrollHeight-$figure.clientHeight
				if (xMaxScrollDistance>0) $figure.scrollLeft=Math.round(xScrollFraction*xMaxScrollDistance)
				if (yMaxScrollDistance>0) $figure.scrollTop =Math.round(yScrollFraction*yMaxScrollDistance)
			}
		})
		$figure.addEventListener('mousemove',(ev)=>{
			$closeButton.classList.toggle('right-position',ev.offsetX>=$figure.offsetWidth/2)
			$closeButton.classList.toggle('bottom-position',ev.offsetY>=$figure.offsetHeight/2)
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
