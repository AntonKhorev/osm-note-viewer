import {startOrResetFadeAnimation} from './html'

export default class FigureDialog {
	private url: string|undefined
	private fallbackMode: boolean
	constructor(
		$root: HTMLElement,
		private $dialog: HTMLDialogElement
	) {
		this.fallbackMode=((window as any).HTMLDialogElement == null)
		$root.addEventListener('osmNoteViewer:newQuery',()=>{
			this.close()
		})
		$root.addEventListener('osmNoteViewer:toggleImage',ev=>{
			if (!(ev.target instanceof HTMLAnchorElement)) return
			this.toggle(ev.target.href)
		})
	}
	close(): void {
		if (this.fallbackMode) {
			return
		}
		this.$dialog.close()
		this.url=undefined
	}
	toggle(url: string): void {
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
		$figure.tabIndex=0
		const $backdrop=document.createElement('div')
		$backdrop.classList.add('backdrop')
		$backdrop.style.backgroundImage=`url(${url})`
		const $img=document.createElement('img')
		$img.src=url
		$img.alt='attached photo'
		$figure.append($backdrop,$img)
		const $closeButton=document.createElement('button')
		$closeButton.classList.add('global')
		$closeButton.innerHTML=`<svg><title>Close photo</title><use href="#reset" /></svg>`
		this.$dialog.append($figure,$closeButton)

		$figure.addEventListener('keydown',(ev)=>{ // probably can't make it a button
			if (ev.key=='Enter' || ev.key==' ') {
				ev.stopPropagation()
				$figure.classList.toggle('zoomed')
			}
		})
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
			startOrResetFadeAnimation($closeButton,'photo-button-fade','fading')
		})
		$closeButton.addEventListener('click',()=>{
			this.close()
		})
		$closeButton.addEventListener('animationend',()=>{
			$closeButton.classList.remove('fading')
		})
		this.$dialog.addEventListener('keydown',(ev)=>{
			if (ev.key=='Escape') {
				ev.stopPropagation()
				this.close()
			}
		})

		this.$dialog.show()
		$figure.focus()
		this.url=url
	}
}
