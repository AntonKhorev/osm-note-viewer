import ServerListSection from './server-list-section'
import StorageSection from './storage-section'
import type NoteViewerStorage from './storage'
import type NoteViewerDB from './db'
import type Server from './server'
import type ServerList from './server-list'
import type Auth from './auth'
import type NoteMap from './map'
import {makeElement, makeDiv, makeLink, bubbleEvent, startOrResetFadeAnimation} from './html'
import {p,em} from './html-shortcuts'

export function makeMenuButton(): HTMLButtonElement {
	const $button=document.createElement('button')
	$button.classList.add('global','menu')
	$button.innerHTML=`<svg><use href="#menu" /></svg>`
	$button.onclick=()=>{
		bubbleEvent($button,'osmNoteViewer:toggleMenu')
	}
	return $button
}

type UrlSequence = {urls: string[], index: number}

export default class OverlayDialog {
	public $menuPanel=makeElement('div')('menu')()
	public $figureDialog=makeElement('dialog')('figure')()
	private imageSequence?: UrlSequence
	private fallbackMode: boolean
	constructor(
		$root: HTMLElement,
		storage: NoteViewerStorage, db: NoteViewerDB,
		server: Server|undefined, serverList: ServerList, serverHash: string,
		auth: Auth|undefined,
		private map: NoteMap|undefined,
		private $menuButton: HTMLButtonElement,
	) {
		this.fallbackMode=((window as any).HTMLDialogElement == null)
		this.menuHidden=!!auth
		this.$menuButton.disabled=!auth
		this.writeMenuPanel(storage,db,server,serverList,serverHash,auth)
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
		$root.addEventListener('osmNoteViewer:toggleMenu',()=>{
			if (this.imageSequence!=null) this.close()
			this.menuHidden=!this.menuHidden
			this.map?.hide(!this.menuHidden)
		})
	}
	private close(): void {
		this.map?.hide(false)
		this.menuHidden=true
		if (this.fallbackMode) {
			return
		}
		this.$figureDialog.close()
		this.imageSequence=undefined
	}
	private toggleImage(imageSequence: UrlSequence): void {
		if (this.fallbackMode) {
			open(imageSequence.urls[imageSequence.index],'photo')
			return
		}
		this.menuHidden=true
		this.$figureDialog.innerHTML=''
		if (this.imageSequence && equalUrlSequences(imageSequence,this.imageSequence)) {
			this.close()
			return
		}
		this.map?.hide(true)

		this.imageSequence=imageSequence
		const $figure=document.createElement('figure')
		$figure.tabIndex=0
		const $backdrop=document.createElement('div')
		const $img=document.createElement('img')
		$backdrop.classList.add('backdrop')
		$img.alt='attached photo'
		const updateImageUrl=()=>{
			const url=imageSequence.urls[imageSequence.index]
			$backdrop.style.backgroundImage=`url(${url})`
			$img.src=url
		}
		updateImageUrl()
		$figure.append($backdrop,$img)
		const $closeButton=document.createElement('button')
		$closeButton.classList.add('global')
		$closeButton.innerHTML=`<svg><title>Close photo</title><use href="#reset" /></svg>`
		this.$figureDialog.append($figure,$closeButton)

		$figure.addEventListener('keydown',ev=>{
			if (ev.key=='Enter' || ev.key==' ') {
				$figure.classList.toggle('zoomed')
			} else if (this.imageSequence && !$figure.classList.contains('zoomed')) {
				if (ev.key=='ArrowUp' || ev.key=='ArrowLeft') {
					this.imageSequence.index=(this.imageSequence.index+this.imageSequence.urls.length-1)%this.imageSequence.urls.length
				} else if (ev.key=='ArrowDown' || ev.key=='ArrowRight') {
					this.imageSequence.index=(this.imageSequence.index+this.imageSequence.urls.length+1)%this.imageSequence.urls.length
				} else if (ev.key=='Home') {
					this.imageSequence.index=0
				} else if (ev.key=='End') {
					this.imageSequence.index=this.imageSequence.urls.length-1
				} else {
					return
				}
				updateImageUrl()
			} else {
				return
			}
			ev.stopPropagation()
			ev.preventDefault()
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
		this.$figureDialog.addEventListener('keydown',(ev)=>{
			if (ev.key=='Escape') {
				ev.stopPropagation()
				this.close()
			}
		})

		this.$figureDialog.show()
		$figure.focus()
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
	get menuHidden() {
		return this.$menuPanel.hidden
	}
	set menuHidden(value: boolean) {
		this.$menuPanel.hidden=value
		this.$menuButton.classList.toggle('opened',!value)
		this.$menuButton.title=value?`Open menu`:`Close menu`
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
