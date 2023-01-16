import NoteViewerStorage from './storage'
import NoteViewerDB, {FetchEntry} from './db'
import Server, {NominatimProvider, OverpassProvider} from './server'
import ServerList from './server-list'
import Auth, {RealAuth} from './auth'
import {NavDialog} from './navbar'
import makeCodeForm from './code'
import serverListConfig from './server-list-config'
import {parseServerListSource} from './server-list-parser'
import ConfirmedButtonListener from './confirmed-button-listener'
import {makeElement, makeDiv, makeLink} from './html'
import {p,code,em} from './html-shortcuts'
import {escapeHash} from './escape'

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
<dd><strong>required</strong>; a <em>URL string</em> or an <em>array</em> of <em>URL strings</em>; used to generate/detect links to users/notes/elements/changesets
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
		private readonly storage: NoteViewerStorage, private readonly db: NoteViewerDB,
		private readonly server: Server|undefined, private readonly serverList: ServerList, private readonly serverHash: string,
		private readonly auth: Auth
	) {
		super()
	}
	writeSectionContent() {
		const writeSubheading=(s:string)=>{
			this.$section.append(makeElement('h3')()(s))
		}
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
		if (this.auth instanceof RealAuth) {
			this.$section.append(
				this.auth.$appSection,
				this.auth.$loginSection
			)
		}
		this.writeStorageSubsection()
		this.writeExtraSubsection()
	}
	writeServersSubsection() {
		const $subsection=startSubsection(`Servers`)
		if (!this.server) $subsection.append(makeDiv('notice','error')(
			`Unknown server in URL hash parameter `,
			code(this.serverHash),
			`. Please select one of the servers below.`
		))
		{
			const $form=document.createElement('form')
			const $table=makeElement('table')('servers')()
			const baseLocation=location.pathname+location.search
			$table.insertRow().append(
				makeElement('th')()(),
				makeElement('th')()(`host`),
				makeElement('th')('capability')(`website`),
				makeElement('th')('capability')(`own tiles`),
				makeElement('th')('capability')(`Nominatim`),
				makeElement('th')('capability')(`Overpass`),
				makeElement('th')('capability')(`Overpass turbo`),
				makeElement('th')()(`note`),
			)
			for (const [availableHost,availableServer] of this.serverList.servers) {
				const hashValue=this.serverList.getHostHashValue(availableServer)
				const availableServerLocation=baseLocation+(hashValue ? `#host=`+escapeHash(hashValue) : '')
				let note:string|HTMLElement = ''
				if (availableServer.noteText && !availableServer.noteUrl) {
					note=availableServer.noteText
				} else if (availableServer.noteUrl) {
					note=makeLink(availableServer.noteText||`[note]`,availableServer.noteUrl)
				}
				const $radio=document.createElement('input')
				const $label=document.createElement('label')
				const $a=makeLink(availableHost,availableServerLocation)
				$radio.type='radio'
				$radio.name='host'
				$label.htmlFor=$radio.id='host-'+availableHost
				$radio.checked=this.server==availableServer
				$radio.tabIndex=-1
				$label.append($a)
				$radio.onclick=()=>$a.click()
				const makeStatusCell=(provider:undefined|NominatimProvider|OverpassProvider)=>makeElement('td')('capability')(
					makeElement('td')('capability')(provider ? makeLink('+',provider.statusUrl) : ''),
				)
				$table.insertRow().append(
					makeElement('td')()($radio),
					makeElement('td')()($label),
					makeElement('td')('capability')(makeLink('+',availableServer.getWebUrl(''))),
					makeElement('td')('capability')(availableServer.tileOwner ? '+' : ''),
					makeStatusCell(availableServer.nominatim),
					makeStatusCell(availableServer.overpass),
					makeElement('td')('capability')(availableServer.overpassTurbo ? makeLink('+',availableServer.overpassTurbo.url) : ''),
					makeElement('td')()(note)
				)
			}
			$form.append($table)
			$subsection.append($form)
		}
		$subsection.append(makeCodeForm(
			this.storage.getString('servers'),
			`Custom servers`,`Apply changes`,
			input=>input==this.storage.getString('servers'),
			input=>{
				if (input.trim()=='') return
				const configSource=JSON.parse(input)
				parseServerListSource(configSource)
			},
			input=>{
				this.storage.setString('servers',input.trim())
			},
			()=>{
				location.reload()
			},
			syntaxDescription,syntaxExamples
		))
		this.$section.append($subsection)
	}
	writeStorageSubsection() {
		const $subsection=startSubsection(`Storage`)
		const $updateFetchesButton=document.createElement('button')
		$updateFetchesButton.textContent=`Update stored fetch list`
		$subsection.append(makeDiv('major-input')($updateFetchesButton))
		const $fetchesContainer=makeDiv()(
			`Click Update button above to see stored fetches`
		)
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
			`Other documentation: `,
			makeLink(`Overpass queries`,`https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL`),`, `,
			makeLink(`OAuth 2.0`,`https://www.rfc-editor.org/rfc/rfc6749`),`, `,
			makeLink(`Doorkeeper`,`https://github.com/doorkeeper-gem/doorkeeper`),` (OAuth implementation used in `,em(`openstreetmap-website`),`)`,
		))
		this.$section.append($subsection)
	}
}

function startSubsection(heading:string): HTMLElement {
	return makeElement('section')()(
		makeElement('h3')()(heading)
	)
}
