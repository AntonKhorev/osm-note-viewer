import type NoteViewerStorage from './storage'
import type NoteViewerDB from './db'
import type {FetchEntry} from './db'
import type Server from './server'
import type ServerList from './server-list'
import type Auth from './auth'
import {NavDialog} from './navbar'
import ServerListSection from './server-list-section'
import ConfirmedButtonListener from './confirmed-button-listener'
import {makeElement, makeDiv, makeLink} from './html'
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
		const $subsection=startSubsection(`Storage`)
		const $updateFetchesButton=document.createElement('button')
		$updateFetchesButton.textContent=`Update stored fetch list`
		$subsection.append(makeDiv('major-input')($updateFetchesButton))
		const $fetchesContainer=makeDiv()(p(
			`Click Update button above to see stored fetches.`
		))
		$subsection.append($fetchesContainer)
		$updateFetchesButton.addEventListener('click',async()=>{
			$updateFetchesButton.disabled=true
			let fetchEntries: FetchEntry[] =[]
			try {
				fetchEntries=await this.db.listFetches()
			} catch {}
			$updateFetchesButton.disabled=false
			$fetchesContainer.innerHTML=''
			const $table=document.createElement('table')
			{
				const $row=$table.insertRow()
				insertCell().append('fetch')
				insertCell().append('mode')
				insertCell().append('content')
				insertCell().append('last access')
				function insertCell() {
					const $th=document.createElement('th')
					$row.append($th)
					return $th
				}
			}
			let n=0
			for (const fetchEntry of fetchEntries) {
				const $row=$table.insertRow()
				$row.insertCell().append(makeLink(`[${++n}]`,'#'+fetchEntry.queryString))
				const searchParams=new URLSearchParams(fetchEntry.queryString)
				$row.insertCell().append(searchParams.get('mode')??'(outdated/invalid)')
				const $userCell=$row.insertCell()
				const username=searchParams.get('display_name')
				const ids=searchParams.get('ids')
				const host=searchParams.get('host')
				const fetchEntryServer=this.serverList.getServer(host)
				if (username) {
					if (fetchEntryServer) {
						const href=fetchEntryServer.web.getUrl(`user/`+encodeURIComponent(username))
						$userCell.append(`user `,makeLink(username,href))
					} else {
						$userCell.append(`user ${username}`)
					}
				} else if (ids) {
					const match=ids.match(/\d+/)
					if (match) {
						const [id]=match
						if (fetchEntryServer) {
							const href=fetchEntryServer.web.getUrl(`note/`+encodeURIComponent(id))
							$userCell.append(`note `,makeLink(id,href),`, ...`)
						} else {
							$userCell.append(`note ${id}, ...`)
						}
					}
				}
				$row.insertCell().append(new Date(fetchEntry.accessTimestamp).toISOString())
				const $deleteButton=document.createElement('button')
				$deleteButton.textContent=`Delete`
				$deleteButton.addEventListener('click',async()=>{
					$deleteButton.disabled=true
					await this.db.deleteFetch(fetchEntry)
					$updateFetchesButton.click()
				})
				$row.insertCell().append($deleteButton)
			}
			$fetchesContainer.append($table)
		})
		{
			const $clearButton=makeElement('button')()(`Clear settings`)
			const $cancelButton=makeElement('button')()(`Cancel clear settings`)
			const $confirmButton=makeElement('button')()(`Confirm clear settings`)
			new ConfirmedButtonListener(
				$clearButton,$cancelButton,$confirmButton,
				async()=>this.storage.clear()
			)
			$subsection.append(makeDiv('major-input')($clearButton,$cancelButton,$confirmButton))
		}
		this.$section.append($subsection)
	}
	writeExtraSubsection() {
		const $subsection=startSubsection(`Extra information`)
		$subsection.append(p(
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

function startSubsection(heading:string): HTMLElement {
	return makeElement('section')()(
		makeElement('h3')()(heading)
	)
}
