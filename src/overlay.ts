import ImageSection from './image-section'
import StorageSection from './storage-section'
import type NoteViewerStorage from './storage'
import type NoteViewerDB from './db'
import type Net from './net'
import type {HashServerSelector} from './net'
import type NoteMap from './map'
import installFigureTouchListeners from './overlay-touch'
import makeHelpDialog from './help-dialog'
import {makeElement, makeDiv, makeLink, startAnimation, cleanupAnimationOnEnd} from './util/html'
import {bubbleEvent} from './util/events'
import {ul,li,p,em,kbd} from './util/html-shortcuts'

export function makeMenuButton(): HTMLButtonElement {
	const $button=makeElement('button')('global','menu')()
	$button.innerHTML=`<svg><use href="#menu" /></svg>`
	$button.onclick=()=>{
		bubbleEvent($button,'osmNoteViewer:menuToggle')
	}
	return $button
}

type UrlSequence = {urls: string[], index: number}

export default class OverlayDialog {
	public $message=makeElement('div')('message')()
	public $menuPanel=makeElement('div')('menu')()
	public $figureDialog=makeElement('dialog')('figure')()
	private $figure=document.createElement('figure')
	private $backdrop=document.createElement('div')
	private $img=document.createElement('img')
	private $figureCaption=makeElement('figcaption')()()
	private $prevImageButton=makeElement('button')('global','prev')()
	private $nextImageButton=makeElement('button')('global','next')()
	private $figureHelpDialog=makeHelpDialog(`Close image viewer help`,[
		makeElement('h2')()(`Image viewer controls`),
		ul(
			li(kbd(`Enter`),` , `,kbd(`Space`),` , `,kbd(`+`),` / `,kbd(`-`),` — toggle image zoom`),
			li(kbd(`Esc`),` — close image viewer`),
		),
		p(`When zoomed out:`),
		ul(
			li(kbd(`Arrow keys`),`, swipe left/right — go to previous/next image in sequence`),
			li(kbd(`Home`),` / `,kbd(`End`),` — go to first/last image in sequence`),
			li(`swipe up/down — close image viewer`)
		)
	])
	private imageSequence?: UrlSequence
	private imageSection?: ImageSection
	constructor(
		$root: HTMLElement,
		storage: NoteViewerStorage, db: NoteViewerDB,
		net: Net<HashServerSelector>,
		private map: NoteMap|undefined,
		private $menuButton: HTMLButtonElement,
	) {
		this.$message.hidden=true
		this.menuHidden=!!net.cx
		this.$menuButton.disabled=!net.cx
		this.writeMenuPanel(storage,db,net)
		this.writeFigureDialog()
		$root.append(this.$figureHelpDialog)
		for (const eventType of [
			'osmNoteViewer:newNoteStream',
			'osmNoteViewer:mapMoveTrigger',
			'osmNoteViewer:elementRender',
			'osmNoteViewer:changesetRender',
			'osmNoteViewer:noteFocus'
		]) {
			$root.addEventListener(eventType,()=>this.close())
		}
		$root.addEventListener('osmNoteViewer:imageToggle',({detail:imageSequence})=>{
			this.toggleImage(imageSequence)
		})
		$root.addEventListener('osmNoteViewer:menuToggle',({detail})=>{
			if (this.imageSequence!=null) this.close()
			if (detail=='login') {
				this.menuHidden=false
				net.focusOnLogin()
			} else if (detail=='image-sources') {
				this.menuHidden=false
				this.imageSection?.focus()
			} else {
				this.menuHidden=!this.menuHidden
			}
			this.map?.hide(!this.menuHidden)
		})
		$root.addEventListener('osmNoteViewer:mapMessageDisplay',({detail})=>{
			if (detail) {
				this.$message.hidden=false
				this.$message.textContent=detail
			} else {
				this.$message.hidden=true
				this.$message.textContent=''
			}
		})
	}
	private writeFigureDialog() {
		this.$figure.tabIndex=0
		this.$backdrop.classList.add('backdrop')
		this.$img.alt='attached photo'
		this.updateImageState()
		this.$figure.append(this.$backdrop,this.$img,this.$figureCaption)
		this.$figureDialog.append(this.$figure)
		const $closeButton=makeElement('button')('global','close')()
		const buttons: [$button:HTMLButtonElement,href:string,title:string][] = [
			[$closeButton,'reset',`Close photo`],
			[this.$prevImageButton,'image-prev',`Previous photo`],
			[this.$nextImageButton,'image-next',`Next photo`]
		]
		for (const [$button,href,title] of buttons) {
			$button.tabIndex=-1
			$button.title=title
			$button.innerHTML=`<svg><use href="#${href}" /></svg>`
			this.$figureDialog.append($button)
		}

		this.$figureDialog.onkeydown=ev=>{
			if (ev.key=='Escape') {
				this.close()
			} else if (ev.key=='F1') {
				this.$figureHelpDialog.showModal()
			} else if (this.viewingZoomedOutImage) {
				if (ev.key=='ArrowUp' || ev.key=='ArrowLeft') {
					this.switchToImageDelta(-1)
				} else if (ev.key=='ArrowDown' || ev.key=='ArrowRight') {
					this.switchToImageDelta(+1)
				} else if (ev.key=='Home') {
					this.switchToImage(0)
				} else if (ev.key=='End') {
					this.switchToImage(-1)
				} else {
					return
				}
				this.updateImageState()
			} else {
				return
			}
			ev.stopPropagation()
			ev.preventDefault()
		}
		this.$figureDialog.onwheel=ev=>{
			if (this.viewingZoomedOutImage) {
				const dIndex=Math.sign(ev.deltaY)
				if (!dIndex) return
				this.switchToImageDelta(dIndex)
				this.updateImageState()
				ev.stopPropagation()
				ev.preventDefault()
			}
		}
		this.$prevImageButton.onclick=()=>{
			this.switchToImageDelta(-1)
			this.updateImageState()
		}
		this.$nextImageButton.onclick=()=>{
			this.switchToImageDelta(+1)
			this.updateImageState()
		}
		const scrollFigure=(xScrollFraction:number,yScrollFraction:number)=>{
			const clamp=(num:number)=>Math.min(Math.max(num,0),1)
			const xMaxScrollDistance=this.$figure.scrollWidth -this.$figure.clientWidth
			const yMaxScrollDistance=this.$figure.scrollHeight-this.$figure.clientHeight
			if (xMaxScrollDistance>0) this.$figure.scrollLeft=Math.round(clamp(xScrollFraction)*xMaxScrollDistance)
			if (yMaxScrollDistance>0) this.$figure.scrollTop =Math.round(clamp(yScrollFraction)*yMaxScrollDistance)
		}
		this.$figure.onkeydown=ev=>{
			if (ev.key=='Enter' || ev.key==' ') {
				if (this.$figure.classList.toggle('zoomed')) {
					scrollFigure(.5,.5)
				}
			} else if (ev.key=='+') {
				this.$figure.classList.add('zoomed')
				scrollFigure(.5,.5)
			} else if (ev.key=='-') {
				this.$figure.classList.remove('zoomed')
			} else {
				return
			}
			ev.stopPropagation()
			ev.preventDefault()
		}
		this.$figure.onclick=ev=>{
			if (this.$figure.classList.contains('zoomed')) {
				this.$figure.classList.remove('zoomed')
			} else {
				let xScrollFraction=(ev.offsetX>=this.$figure.offsetWidth /2 ? 1 : 0)
				let yScrollFraction=(ev.offsetY>=this.$figure.offsetHeight/2 ? 1 : 0)
				if (ev.target==this.$img) {
					xScrollFraction=ev.offsetX/this.$img.offsetWidth
					yScrollFraction=ev.offsetY/this.$img.offsetHeight
				}
				this.$figure.classList.add('zoomed')
				scrollFigure(xScrollFraction,yScrollFraction)
			}
		}
		this.$figure.onmousemove=ev=>{
			const rect=this.$figure.getBoundingClientRect()
			$closeButton.classList.toggle('right-position',ev.clientX-rect.left>=rect.width/2)
			$closeButton.classList.toggle('bottom-position',ev.clientY-rect.top>=rect.height/2)
			for (const [$button] of buttons) {
				startFadeAnimation($button)
			}
			startFadeAnimation(this.$figureCaption)
		}
		installFigureTouchListeners(
			this.$figure,this.$img,
			()=>!!(this.imageSequence && this.imageSequence.urls.length>1),
			d=>{
				this.switchToImageDelta(d)
				this.updateImageState()
			},
			()=>this.close(),
			(xScrollFraction,yScrollFraction)=>{
				this.$figure.classList.add('zoomed')
				scrollFigure(xScrollFraction,yScrollFraction)
			}
		)
		$closeButton.onclick=()=>{
			this.close()
		}
		for (const [$button] of buttons) {
			cleanupAnimationOnEnd($button)
		}
		cleanupAnimationOnEnd(this.$figureCaption)
	}
	private writeMenuPanel(
		storage: NoteViewerStorage, db: NoteViewerDB,
		net: Net<HashServerSelector>
	) {
		const $lead=makeDiv('lead')()
		{
			const $about=makeDiv()(
				makeElement('strong')()(`note-viewer`)
			)
			const build=document.body.dataset.build
			if (build) $about.append(` build ${build}`)
			$about.append(
				` — `,makeLink(`source code`,`https://github.com/AntonKhorev/osm-note-viewer`)
			)
			$lead.append($about)
		}
		const $scrolling=makeDiv('panel','scrolling')()
		$scrolling.append(...net.$sections)
		{
			const $subsection=makeElement('section')()()
			this.imageSection=new ImageSection($subsection,storage)
			$scrolling.append($subsection)
		}{
			const $subsection=makeElement('section')()()
			new StorageSection($subsection,storage,db,net.serverSelector)
			$scrolling.append($subsection)
		}
		$scrolling.append(makeExtraSubsection())
		this.$menuPanel.append($lead,$scrolling)
	}
	private close(): void {
		this.map?.hide(false)
		this.menuHidden=true
		this.$figureDialog.close()
		this.imageSequence=undefined
		this.updateImageState()
	}
	private toggleImage(imageSequence: UrlSequence): void {
		this.menuHidden=true
		if (this.imageSequence && equalUrlSequences(imageSequence,this.imageSequence)) {
			this.close()
			return
		}
		this.map?.hide(true)
		this.imageSequence=imageSequence
		this.updateImageState()
		this.$figureDialog.show()
		this.$figure.focus()
	}
	private get menuHidden() {
		return this.$menuPanel.hidden
	}
	private set menuHidden(value: boolean) {
		this.$menuPanel.hidden=value
		this.$menuButton.classList.toggle('opened',!value)
		this.$menuButton.setAttribute('aria-expanded',String(!value))
		this.$menuButton.title=value?`Open menu`:`Close menu`
	}
	private updateImageState() {
		this.$figure.classList.remove('zoomed')
		if (this.imageSequence) {
			const url=this.imageSequence.urls[this.imageSequence.index]
			this.$backdrop.style.backgroundImage=`url(${url})`
			this.$img.removeAttribute('src') // make the old image disappear, otherwise it will stay until the next one is fully loaded
			this.$img.src=url
			this.$figureCaption.textContent=url
			const arePrevNextButtonsHidden=this.$prevImageButton.hidden=this.$nextImageButton.hidden=this.imageSequence.urls.length<=1
			if (!arePrevNextButtonsHidden) {
				startFadeAnimation(this.$prevImageButton)
				startFadeAnimation(this.$nextImageButton)
			}
			startFadeAnimation(this.$figureCaption)
		} else {
			this.$backdrop.style.removeProperty('backgroundImage')
			this.$img.removeAttribute('src')
		}
	}
	private switchToImage(index: number) {
		if (!this.imageSequence) return
		this.imageSequence.index=(this.imageSequence.urls.length+index)%this.imageSequence.urls.length
	}
	private switchToImageDelta(dIndex: number) {
		if (!this.imageSequence) return
		this.imageSequence.index=(this.imageSequence.index+this.imageSequence.urls.length+dIndex)%this.imageSequence.urls.length
	}
	private get viewingZoomedOutImage(): boolean {
		return !!this.imageSequence && !this.$figure.classList.contains('zoomed')
	}
}

function makeExtraSubsection() {
	return makeElement('section')()(makeElement('h2')()(
		`Extra information`
	),p(
		`Notes implementation code: `,
		makeLink(`notes api controller`,`https://github.com/openstreetmap/openstreetmap-website/blob/master/app/controllers/api/notes_controller.rb`),
		` (db search query is build there), `,
		makeLink(`notes controller`,`https://github.com/openstreetmap/openstreetmap-website/blob/master/app/controllers/notes_controller.rb`),
		` (paginated user notes query is build there), `,
		makeLink(`note model`,`https://github.com/openstreetmap/openstreetmap-website/blob/master/app/models/note.rb`),
		`, `,
		makeLink(`note comment model`,`https://github.com/openstreetmap/openstreetmap-website/blob/master/app/models/note_comment.rb`),
		` in `,
		makeLink(`openstreetmap-website`,`https://wiki.openstreetmap.org/wiki/Openstreetmap-website`),
		` (not implemented in `,
		makeLink(`CGIMap`,`https://wiki.openstreetmap.org/wiki/Cgimap`),
		`)`
	),p(
		`OAuth 2.0: `,
		makeLink(`main RFC`,`https://www.rfc-editor.org/rfc/rfc6749`),`, `,
		makeLink(`token revocation RFC`,`https://www.rfc-editor.org/rfc/rfc7009`),` (logouts), `,
		makeLink(`proof key RFC`,`https://www.rfc-editor.org/rfc/rfc7636`),`, `,
		makeLink(`Doorkeeper`,`https://github.com/doorkeeper-gem/doorkeeper`),` (OAuth implementation used in `,em(`openstreetmap-website`),`), `,
		makeLink(`OSM wiki`,`https://wiki.openstreetmap.org/wiki/OAuth`)
	),p(
		`Other documentation: `,
		makeLink(`Overpass queries`,`https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL`),`, `,
		makeLink(`Puppeteer`,`https://pptr.dev/`),` (in-browser testing)`
	))
}

function equalUrlSequences(seq1: UrlSequence, seq2: UrlSequence): boolean {
	if (seq1.index!=seq2.index) return false
	if (seq1.urls.length!=seq2.urls.length) return false
	return seq1.urls.every((_,i)=>seq1.urls[i]==seq2.urls[i])
}

function startFadeAnimation($e: HTMLElement): void {
	startAnimation($e,'figure-control-fade','3s')
}
