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
	constructor(private storage: NoteViewerStorage, private db: NoteViewerDB, private server: Server, private serverList: ServerList) {
		super()
	}
	writeSectionContent() {
		const writeSubheading=(s:string)=>{
			this.$section.append(makeElement('h3')()(s))
		}
		const writeBlock = (makeBlockContents: ()=>Array<HTMLElement|string>): HTMLElement => {
			const $block=makeDiv()(...makeBlockContents())
			this.$section.append($block)
			return $block
		}
		writeBlock(()=>{
			const result: Array<HTMLElement|string> = []
			result.push(makeElement('strong')()(`note-viewer`))
			const build=document.body.dataset.build
			if (build) result.push(` build ${build}`)
			result.push(` — `)
			result.push(makeLink(`source code`,`https://github.com/AntonKhorev/osm-note-viewer`))
			return result
		})
		writeSubheading(`Servers`)
		writeBlock(()=>{
			const $list=makeElement('ul')()()
			const baseLocation=location.pathname+location.search
			for (const [newHost,newServer] of this.serverList.servers) {
				const hash=this.serverList.getHostHash(newServer)
				const newLocation=baseLocation+(hash ? `#host=`+escapeHash(hash) : '')
				let itemContent:Array<string|HTMLElement>=[makeLink(newHost,newLocation)]
				if (newServer.noteText && !newServer.noteUrl) {
					itemContent.push(` - `+newServer.noteText)
				} else if (newServer.noteUrl) {
					itemContent.push(` - `,makeLink(newServer.noteText||`note`,newServer.noteUrl))
				}
				if (this.server==newServer) {
					itemContent.push(` - currently selected`)
					itemContent=[makeElement('strong')()(...itemContent)]
				}
				$list.append(makeElement('li')()(...itemContent))
			}
			return [$list]
		})
		writeSubheading(`Storage`)
		const $updateFetchesButton=document.createElement('button')
		writeBlock(()=>{
			$updateFetchesButton.textContent=`Update stored fetch list`
			return [$updateFetchesButton]
		})
		const $fetchesContainer=writeBlock(()=>{
			return [`Click Update button above to see stored fetches`]
		})
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
				if (username) {
					const href=this.server.getWebUrl(`user/`+encodeURIComponent(username))
					$userCell.append(`user `,makeLink(username,href))
				} else if (ids) {
					const match=ids.match(/\d+/)
					if (match) {
						const [id]=match
						const href=this.server.getWebUrl(`note/`+encodeURIComponent(id))
						$userCell.append(`note `,makeLink(id,href),`, ...`)
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
		writeBlock(()=>{
			const $clearButton=document.createElement('button')
			$clearButton.textContent=`Clear settings`
			$clearButton.addEventListener('click',()=>{
				this.storage.clear()
			})
			return [$clearButton]
		})
		writeSubheading(`Extra information`)
		writeBlock(()=>[
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
		])
		writeBlock(()=>[
			`Other documentation: `,
			makeLink(`Overpass queries`,`https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL`)
		])
	}
}
