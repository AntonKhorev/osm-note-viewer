import ServerListSection from './server-list-section'
import StorageSection from './storage-section'
import type NoteViewerStorage from './storage'
import type NoteViewerDB from './db'
import type Server from './server'
import type ServerList from './server-list'
import type Auth from './auth'
import type NoteMap from './map'
import makeHelpDialog from './help-dialog'
import {makeElement, makeDiv, makeLink, bubbleEvent, startOrResetFadeAnimation} from './html'
import {ul,li,p,em,kbd} from './html-shortcuts'

export function makeMenuButton(): HTMLButtonElement {
	const $button=document.createElement('button')
	$button.classList.add('global','menu')
	$button.innerHTML=`<svg><use href="#menu" /></svg>`
	$button.onclick=()=>{
		bubbleEvent($button,'osmNoteViewer:menuToggle')
	}
	return $button
}

type UrlSequence = {urls: string[], index: number}

export default class OverlayDialog {
	public $menuPanel=makeElement('div')('menu')()
	public $figureDialog=makeElement('dialog')('figure')()
	private $figure=document.createElement('figure')
	private $backdrop=document.createElement('div')
	private $img=document.createElement('img')
	private $figureHelpDialog=makeHelpDialog(`Close image viewer help`,[
		makeElement('h2')()(`Image viewer keyboard controls`),
		ul(
			li(kbd(`Enter`),` and `,kbd(`Space`),` — toggle image zoom`),
			li(kbd(`Esc`),` — close image viewer`),
		),
		p(`When zoomed out:`),
		ul(
			li(kbd(`Arrow keys`),` — go to previous/next image in sequence`),
			li(kbd(`Home`),` / `,kbd(`End`),` — go to first/last image in sequence`),
		)
	])
	private imageSequence?: UrlSequence
	constructor(
		$root: HTMLElement,
		storage: NoteViewerStorage, db: NoteViewerDB,
		server: Server|undefined, serverList: ServerList, serverHash: string,
		auth: Auth|undefined,
		private map: NoteMap|undefined,
		private $menuButton: HTMLButtonElement,
	) {
		this.menuHidden=!!auth
		this.$menuButton.disabled=!auth
		this.writeMenuPanel(storage,db,server,serverList,serverHash,auth)
		this.writeFigureDialog()
		$root.append(this.$figureHelpDialog)
		for (const eventType of [
			'osmNoteViewer:newNoteStream',
			'osmNoteViewer:mapMoveTrigger',
			'osmNoteViewer:elementLinkClick',
			'osmNoteViewer:changesetLinkClick',
			'osmNoteViewer:noteFocus'
		]) {
			$root.addEventListener(eventType,()=>this.close())
		}
		$root.addEventListener('osmNoteViewer:imageToggle',({detail:imageSequence})=>{
			this.toggleImage(imageSequence)
		})
		$root.addEventListener('osmNoteViewer:menuToggle',()=>{
			if (this.imageSequence!=null) this.close()
			this.menuHidden=!this.menuHidden
			this.map?.hide(!this.menuHidden)
		})
	}
	private writeFigureDialog() {
		this.$figure.tabIndex=0
		this.$backdrop.classList.add('backdrop')
		this.$img.alt='attached photo'
		this.updateImageState()
		this.$figure.append(this.$backdrop,this.$img)
		const $closeButton=document.createElement('button')
		$closeButton.tabIndex=-1
		$closeButton.classList.add('global')
		$closeButton.innerHTML=`<svg><title>Close photo</title><use href="#reset" /></svg>`
		this.$figureDialog.append(this.$figure,$closeButton)

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
		this.$figure.onkeydown=ev=>{
			if (ev.key=='Enter' || ev.key==' ') {
				this.$figure.classList.toggle('zoomed')
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
				const clamp=(num:number)=>Math.min(Math.max(num,0),1)
				let xScrollFraction=(ev.offsetX>=this.$figure.offsetWidth /2 ? 1 : 0)
				let yScrollFraction=(ev.offsetY>=this.$figure.offsetHeight/2 ? 1 : 0)
				if (ev.target==this.$img) {
					xScrollFraction=clamp(ev.offsetX/this.$img.offsetWidth)
					yScrollFraction=clamp(ev.offsetY/this.$img.offsetHeight)
				}
				this.$figure.classList.add('zoomed')
				const xMaxScrollDistance=this.$figure.scrollWidth -this.$figure.clientWidth
				const yMaxScrollDistance=this.$figure.scrollHeight-this.$figure.clientHeight
				if (xMaxScrollDistance>0) this.$figure.scrollLeft=Math.round(xScrollFraction*xMaxScrollDistance)
				if (yMaxScrollDistance>0) this.$figure.scrollTop =Math.round(yScrollFraction*yMaxScrollDistance)
			}
		}
		this.$figure.onmousemove=ev=>{
			$closeButton.classList.toggle('right-position',ev.offsetX>=this.$figure.offsetWidth/2)
			$closeButton.classList.toggle('bottom-position',ev.offsetY>=this.$figure.offsetHeight/2)
			startOrResetFadeAnimation($closeButton,'photo-button-fade','fading')
		}
		$closeButton.onclick=()=>{
			this.close()
		}
		$closeButton.onanimationend=()=>{
			$closeButton.classList.remove('fading')
		}
	}
	private writeMenuPanel(
		storage: NoteViewerStorage, db: NoteViewerDB,
		server: Server|undefined, serverList: ServerList, serverHash: string,
		auth: Auth|undefined
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
		auth?.writeMenuSections($scrolling)
		{
			const $subsection=makeElement('section')()()
			new ServerListSection($subsection,storage,server,serverList,serverHash)
			$scrolling.append($subsection)
		}{
			const $subsection=makeElement('section')()()
			new StorageSection($subsection,storage,db,serverList)
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
		this.$menuButton.title=value?`Open menu`:`Close menu`
	}
	private updateImageState() {
		this.$figure.classList.remove('zoomed')
		if (this.imageSequence) {
			const url=this.imageSequence.urls[this.imageSequence.index]
			this.$backdrop.style.backgroundImage=`url(${url})`
			this.$img.src=url
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
