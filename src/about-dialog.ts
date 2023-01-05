import NoteViewerStorage from './storage'
import NoteViewerDB, {FetchEntry} from './db'
import Server from './server'
import ServerList from './server-list'
import {NavDialog} from './navbar'
import {makeElement, makeDiv, makeLink} from './html'
import {escapeHash} from './escape'

export default class AboutDialog extends NavDialog {
	shortTitle=`About`
	title=`About`
	constructor(
		private storage: NoteViewerStorage, private db: NoteViewerDB,
		private server: Server|undefined, private serverList: ServerList, private serverHash: string
	) {
		super()
	}
	writeSectionContent() {
		const writeSubheading=(s:string)=>{
			this.$section.append(makeElement('h3')()(s))
		}
		{
			const $block=makeDiv()(
				makeElement('strong')()(`note-viewer`)
			)
			const build=document.body.dataset.build
			if (build) $block.append(` build ${build}`)
			$block.append(
				` — `,makeLink(`source code`,`https://github.com/AntonKhorev/osm-note-viewer`)
			)
			this.$section.append($block)
		}
		writeSubheading(`Servers`)
		{
			if (!this.server) this.$section.append(makeDiv('notice','error')(
				`Unknown server in URL hash parameter `,
				makeElement('code')()(this.serverHash),
				`. Please select one of the servers below.`
			))
			const $list=makeElement('ul')()()
			const baseLocation=location.pathname+location.search
			for (const [newHost,newServer] of this.serverList.servers) {
				const hashValue=this.serverList.getHostHashValue(newServer)
				const newLocation=baseLocation+(hashValue ? `#host=`+escapeHash(hashValue) : '')
				let itemContent:Array<string|HTMLElement>=[makeLink(newHost,newLocation)]
				if (newServer.noteText && !newServer.noteUrl) {
					itemContent.push(` — `+newServer.noteText)
				} else if (newServer.noteUrl) {
					itemContent.push(` — `,makeLink(newServer.noteText||`note`,newServer.noteUrl))
				}
				if (this.server==newServer) {
					itemContent.push(` — currently selected`)
					itemContent=[makeElement('strong')()(...itemContent)]
				}
				$list.append(makeElement('li')()(...itemContent))
			}
			this.$section.append(makeDiv()($list))
		}
		writeSubheading(`Storage`)
		const $updateFetchesButton=document.createElement('button')
		{
			$updateFetchesButton.textContent=`Update stored fetch list`
			this.$section.append(makeDiv('major-input')($updateFetchesButton))
		}
		const $fetchesContainer=makeDiv()(
			`Click Update button above to see stored fetches`
		)
		this.$section.append($fetchesContainer)
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
						const href=fetchEntryServer.getWebUrl(`user/`+encodeURIComponent(username))
						$userCell.append(`user `,makeLink(username,href))
					} else {
						$userCell.append(`user ${username}`)
					}
				} else if (ids) {
					const match=ids.match(/\d+/)
					if (match) {
						const [id]=match
						if (fetchEntryServer) {
							const href=fetchEntryServer.getWebUrl(`note/`+encodeURIComponent(id))
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
			hide($cancelButton)
			const $confirmButton=makeElement('button')()(`Confirm clear settings`)
			hide($confirmButton)
			$clearButton.onclick=()=>{
				hide($clearButton)
				unhide($cancelButton)
				unhide($confirmButton)
			}
			$cancelButton.onclick=()=>{
				unhide($clearButton)
				hide($cancelButton)
				hide($confirmButton)
			}
			$confirmButton.onclick=()=>{
				this.storage.clear()
				unhide($clearButton)
				hide($cancelButton)
				hide($confirmButton)
			}
			this.$section.append(makeDiv('major-input')($clearButton,$cancelButton,$confirmButton))
			function hide($e:HTMLElement) {
				$e.style.display='none'
			}
			function unhide($e:HTMLElement) {
				$e.style.removeProperty('display')
			}
		}
		writeSubheading(`Extra information`)
		this.$section.append(makeDiv()(
			`Notes implementation code: `,
			makeLink(`notes api controller`,`https://github.com/openstreetmap/openstreetmap-website/blob/master/app/controllers/api/notes_controller.rb`),
			` (db search query is build there), `,
			makeLink(`notes controller`,`https://github.com/openstreetmap/openstreetmap-website/blob/master/app/controllers/notes_controller.rb`),
			` (paginated user notes query is build there), `,
			makeLink(`note model`,`https://github.com/openstreetmap/openstreetmap-website/blob/master/app/models/note.rb`),
			`, `,
			makeLink(`note comment model`,`https://github.com/openstreetmap/openstreetmap-website/blob/master/app/models/note_comment.rb`),
			` in `,
			makeLink(`Rails Port`,`https://wiki.openstreetmap.org/wiki/The_Rails_Port`),
			` (not implemented in `,
			makeLink(`CGIMap`,`https://wiki.openstreetmap.org/wiki/Cgimap`),
			`)`
		))
		this.$section.append(makeDiv()(
			`Other documentation: `,
			makeLink(`Overpass queries`,`https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL`)
		))
	}
}
