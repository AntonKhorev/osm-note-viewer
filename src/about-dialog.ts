import NoteViewerStorage from './storage'
import NoteViewerDB, {FetchEntry} from './db'
import Server from './server'
import ServerList from './server-list'
import {NavDialog} from './navbar'
import {makeElement, makeDiv, makeLink} from './html'
import makeCodeForm from './code'
import {escapeHash} from './escape'
import serverListConfig from './server-list-config'
import {parseServerListSource} from './server-list-parser'

const syntaxDescription=`<summary>Custom server configuration syntax</summary>
<p>Uses <a href=https://en.wikipedia.org/wiki/JSON>JSON</a> format to describe one or more custom servers.
These servers can be referred to in the <code>host</code> URL parameter and appear in the list above.
The entire custom servers input can be one of:</p>
<ul>
<li>empty when no custom servers are specified
<li>an <em>array</em> where each element is a ${term('server specification')}
<li>a single ${term('server specification')}
</ul>
<p>A ${term('server specification')} is <em>null</em> for default OSM server configuration, a <em>URL string</em> for a quick configuration, or an <em>object</em> with optional properties described below.
A <em>string</em> is equivalent to an <em>object</em> with only the ${property('web')} property set.
Possible <em>object</em> properties are:</p>
<dl>
<dt>${property('web')}
<dd>a <em>URL string</em> or an <em>array</em> of <em>URL strings</em>; used to generate/detect links to users/notes/elements/changesets
<dt>${property('api')}
<dd>a <em>URL string</em>; used for OSM API requests; defaults to ${property('web')} property value if not specified
<dt>${property('nominatim')}
<dd>a <em>URL string</em> pointing to a <a href=https://wiki.openstreetmap.org/wiki/Nominatim>Nominatim</a> service
<dt>${property('overpass')}
<dd>a <em>URL string</em> pointing to an <a href=https://wiki.openstreetmap.org/wiki/Overpass_API>Overpass API</a> server
<dt>${property('overpassTurbo')}
<dd>a <em>URL string</em> pointing to an <a href=https://wiki.openstreetmap.org/wiki/Overpass_turbo>Overpass turbo</a> web page
<dt>${property('tiles')}
<dd>a ${term('tiles specification')}
<dt>${property('world')}
<dd>a <em>string</em>; if it's not <code>"earth"</code>, street view tools won't be shown
<dt>${property('note')}
<dd>a <em>URL string</em>, a <em>text string</em> or an <em>array</em> of both representing a note about the server visible on the server list
</dl>
<p>A ${term('tiles specification')} is a <em>string</em> or an an <em>object</em> with optional properties described below.
A <em>string</em> value is equivalent to an <em>object</em> with only the ${property('template')} property set.
Possible <em>object</em> properties are:</p>
<dl>
<dt>${property('template')}
<dd>a <em>string</em> with template parameters like "<code>https://tile.openstreetmap.org/{z}/{x}/{y}.png</code>" or "<code>https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png</code>" to generate tile URLs
<dt>${property('attribution')}
<dd>a <em>URL string</em>, a <em>text string</em> or an <em>array</em> of both containing an <a href=https://wiki.osmfoundation.org/wiki/Licence/Attribution_Guidelines#Interactive_maps>attribution</a> displayed in the corner of the map
<dt>${property('zoom')}
<dd>a number with max zoom level; defaults to the OSM max zoom value of 19
</dl>
`

const syntaxExamples: [string,string[]][] = [
	[`Local server on port 3333`,[`"http://127.0.0.1:3333/"`]],
	[`Dev server with custom tiles`,[
		`{`,
		`  "web": "https://api06.dev.openstreetmap.org/",`,
		`  "tiles": "https://tile.openstreetmap.de/{z}/{x}/{y}.png",`,
		`  "note": "dev server with German tiles"`,
		`}`
	]],
	[`Dev server with custom tiles and different max zoom`,[
		`{`,
		`  "web": "https://api06.dev.openstreetmap.org/",`,
		`  "tiles": {`,
		`    "template": "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",`,
		`    "zoom": 20`,
		`  },`,
		`  "note": "dev server with CyclOSM tiles"`,
		`}`
	]],
	[`Default configuration`,[JSON.stringify(serverListConfig,undefined,2)]]
]

function term(t:string):string {
	return `<em>&lt;${t}&gt;</em>`
}
function property(t:string): string {
	return `<strong><code>${t}</code></strong>`
}

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
			this.$section.append(
				makeDiv()($list),
				makeCodeForm(
					this.storage.getItem('servers')??'',
					`Custom servers`,`Apply changes`,
					input=>input==this.storage.getItem('servers')??'',
					input=>{
						if (input=='') return
						const configSource=JSON.parse(input)
						parseServerListSource(configSource)
					},
					input=>this.storage.setOrRemoveItem('servers',input),
					()=>{
						location.reload()
					},
					syntaxDescription,syntaxExamples
				)
			)
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
