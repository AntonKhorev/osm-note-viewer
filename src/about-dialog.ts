import NoteViewerStorage from './storage'
import NoteViewerDB, {FetchEntry} from './db'
import {NavDialog} from './navbar'
import {makeElement, makeDiv, makeLink, makeUserNameLink} from './util'

export default class AboutDialog extends NavDialog {
	shortTitle=`About`
	title=`About`
	constructor(private storage: NoteViewerStorage, private db: NoteViewerDB) {
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
		const makeCode = (s: string): HTMLElement => {
			const $code=document.createElement('code')
			$code.textContent=s
			return $code
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
				fetchEntries=await this.db.view()
			} catch {}
			$updateFetchesButton.disabled=false
			$fetchesContainer.innerHTML=''
			const $table=document.createElement('table')
			{
				const $row=$table.insertRow()
				insertCell().append('fetch')
				insertCell().append('mode')
				insertCell().append('user')
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
				if (username) $userCell.append(makeUserNameLink(username))
				$row.insertCell().append(String(new Date(fetchEntry.accessTimestamp)))
				const $deleteButton=document.createElement('button')
				$deleteButton.textContent=`Delete`
				$deleteButton.addEventListener('click',async()=>{
					$deleteButton.disabled=true
					await this.db.delete(fetchEntry)
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
			`User query have whitespace trimmed, then the remaining part starting with `,makeCode(`#`),` is treated as a user id; containing `,makeCode(`/`),`is treated as a URL, anything else as a username. `,
			`This works because usernames can't contain any of these characters: `,makeCode(`/;.,?%#`),` , can't have leading/trailing whitespace, have to be between 3 and 255 characters in length.`
		])
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
