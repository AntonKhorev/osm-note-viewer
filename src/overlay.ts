import ServerListSection from './server-list-section'
import StorageSection from './storage-section'
import type NoteViewerStorage from './storage'
import type NoteViewerDB from './db'
import type Server from './server'
import type ServerList from './server-list'
import type Auth from './auth'
import {makeElement, makeDiv, makeLink, startOrResetFadeAnimation} from './html'
import {p,em} from './html-shortcuts'

export default class OverlayDialog {
	public $menuPanel=makeElement('div')('menu')()
	public $figureDialog=makeElement('dialog')('figure')()
	private url: string|undefined
	private fallbackMode: boolean
	constructor(
		$root: HTMLElement,
		storage: NoteViewerStorage, db: NoteViewerDB,
		server: Server|undefined, serverList: ServerList, serverHash: string,
		auth: Auth|undefined,
		private $mapContainer: HTMLElement
	) {
		this.fallbackMode=((window as any).HTMLDialogElement == null)
		this.$menuPanel.hidden=!!auth
		this.writeMenuPanel(storage,db,server,serverList,serverHash,auth)
		for (const eventType of [
			'osmNoteViewer:newFetch',
			'osmNoteViewer:mapMoveTrigger',
			'osmNoteViewer:clickElementLink',
			'osmNoteViewer:clickChangesetLink',
			'osmNoteViewer:focusOnNote'
		]) {
			$root.addEventListener(eventType,()=>this.close())
		}
		$root.addEventListener('osmNoteViewer:toggleImage',ev=>{
			if (!(ev.target instanceof HTMLAnchorElement)) return
			this.toggleImage(ev.target.href)
		})
		$root.addEventListener('osmNoteViewer:toggleMenu',()=>{
			if (this.url!=null) this.close()
			this.$menuPanel.hidden=!this.$menuPanel.hidden
			this.$mapContainer.hidden=!this.$menuPanel.hidden
		})
	}
	private close(): void {
		this.$mapContainer.hidden=false
		this.$menuPanel.hidden=true
		if (this.fallbackMode) {
			return
		}
		this.$figureDialog.close()
		this.url=undefined
	}
	private toggleImage(url: string): void {
		if (this.fallbackMode) {
			open(url,'photo')
			return
		}
		this.$menuPanel.hidden=true
		this.$figureDialog.innerHTML=''
		if (url==this.url) {
			this.close()
			return
		}
		this.$mapContainer.hidden=true

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
		this.$figureDialog.append($figure,$closeButton)

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
		this.$figureDialog.addEventListener('keydown',(ev)=>{
			if (ev.key=='Escape') {
				ev.stopPropagation()
				this.close()
			}
		})

		this.$figureDialog.show()
		$figure.focus()
		this.url=url
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
