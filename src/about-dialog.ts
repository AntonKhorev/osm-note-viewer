import type NoteViewerStorage from './storage'
import type NoteViewerDB from './db'
import type Server from './server'
import type ServerList from './server-list'
import type Auth from './auth'
import {NavDialog} from './navbar'
import StorageSection from './storage-section'
import ServerListSection from './server-list-section'
import {makeElement, makeLink} from './html'
import {p,em} from './html-shortcuts'

export default class AboutDialog extends NavDialog {
	shortTitle=`About`
	title=`About`
	constructor(
		private readonly storage: NoteViewerStorage, private readonly db: NoteViewerDB,
		private readonly server: Server|undefined, private readonly serverList: ServerList, private readonly serverHash: string,
		private readonly auth: Auth|undefined
	) {
		super()
	}
	writeSectionContent() {
		{
			const $section=makeElement('section')()(
				makeElement('strong')()(`note-viewer`)
			)
			const build=document.body.dataset.build
			if (build) $section.append(` build ${build}`)
			$section.append(
				` — `,makeLink(`source code`,`https://github.com/AntonKhorev/osm-note-viewer`)
			)
			this.$section.append($section)
		}
		this.writeServersSubsection()
		this.auth?.writeAboutDialogSections(this.$section)
		this.writeStorageSubsection()
		this.writeExtraSubsection()
	}
	writeServersSubsection() {
		const $subsection=makeElement('section')()()
		new ServerListSection($subsection,this.storage,this.server,this.serverList,this.serverHash)
		this.$section.append($subsection)
	}
	writeStorageSubsection() {
		const $subsection=makeElement('section')()()
		new StorageSection($subsection,this.storage,this.db,this.serverList)
		this.$section.append($subsection)
	}
	writeExtraSubsection() {
		const $subsection=makeElement('section')()(makeElement('h3')()(
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
		this.$section.append($subsection)
	}
}
