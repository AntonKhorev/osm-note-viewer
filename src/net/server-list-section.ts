import type NoteViewerStorage from '../storage'
import type Server from './server'
import type ServerList from './server-list'
import {parseServerListSource} from './server-list-parser'
import makeCodeForm from '../util/code-form'
import RadioTable from '../util/radio-table'
import {makeElement, makeDiv, makeLink} from '../util/html'
import {code} from '../util/html-shortcuts'
import {escapeHash} from '../util/escape'

function term(t:string):string {
	return `<em>&lt;${t}&gt;</em>`
}
function property(t:string): string {
	return `<strong><code>${t}</code></strong>`
}

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
<dt>${property('oauth')}
<dd>an ${term('oauth specification')}
<dt>${property('note')}
<dd>a <em>URL string</em>, a <em>text string</em> or an <em>array</em> of both representing a note about the server visible on the server list
</dl>
<p>A ${term('tiles specification')} is a <em>string</em> or an <em>object</em> with optional properties described below.
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
<p>An ${term('oauth specification')} is an <em>object</em> describing the registration of <em>note-viewer</em> as an <a href=https://wiki.openstreetmap.org/wiki/OAuth#OAuth_2.0_2>OAuth 2 app</a> on this OSM server.
It can have the following properties:</p>
<dl>
<dt>${property('id')}
<dd>a <em>string</em> with the OAuth <em>client id</em>; this property is <strong>required</strong> when an ${term('oauth specification')} is present
<dt>${property('url')}
<dd>a <em>string</em> with the OAuth <em>redirect URI</em> matching the location where <em>note-viewer</em> is hosted;
this property is optional, it is used to remind about the correct location that is going to receive OAuth redirects in case if <em>note-viewer</em> is copied to a different location
</dl>
`

const makeSyntaxExamples=(defaultServerListConfig: unknown):[string,string[]][]=>[
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
	[`Default configuration`,[JSON.stringify(defaultServerListConfig,undefined,2)]]
]

export default class ServerListSection {
	constructor(
		$section: HTMLElement,
		storage: NoteViewerStorage,
		server: Server|undefined,
		serverList: ServerList,
		serverHash: string
	) {
		$section.append(
			makeElement('h2')()(`Servers`)
		)
		if (!server) $section.append(makeDiv('notice','error')(
			`Unknown server in URL hash parameter `,
			code(serverHash),
			`. Please select one of the servers below.`
		))
		{
			const serverTable=new RadioTable('host',[
				[[],[`host`]],
				[['capability'],[`website`]],
				[['capability'],[`own tiles`]],
				[['capability'],[`Nominatim`]],
				[['capability'],[`Overpass`]],
				[['capability'],[`Overpass turbo`]],
				[[],[`note`]],
			])
			const baseLocation=location.pathname+location.search
			for (const [availableHost,availableServer] of serverList.servers) {
				const hashValue=serverList.getHostHashValue(availableServer)
				const availableServerLocation=baseLocation+(hashValue ? `#host=`+escapeHash(hashValue) : '')
				let note:string|HTMLElement = ''
				if (availableServer.noteText && !availableServer.noteUrl) {
					note=availableServer.noteText
				} else if (availableServer.noteUrl) {
					note=makeLink(availableServer.noteText||`[note]`,availableServer.noteUrl)
				}
				serverTable.addRow(($radio)=>{
					$radio.checked=server==availableServer
					$radio.tabIndex=-1
					const $a=makeLink(availableHost,availableServerLocation)
					const $label=makeElement('label')()($a)
					$label.htmlFor=$radio.id
					$radio.onclick=()=>$a.click()
					return [
						[$label],
						availableServer.web.getUrl(''),
						availableServer.tile.owner,
						availableServer.nominatim?.statusUrl,
						availableServer.overpass?.statusUrl,
						availableServer.overpassTurbo?.url,
						[note]
					]
				})
			}
			$section.append(serverTable.$table)
		}
		$section.append(makeCodeForm(
			storage.getString('servers'),'',
			`Custom servers configuration`,`Configuration`,`Apply changes`,
			input=>input==storage.getString('servers'),
			input=>{
				if (input.trim()=='') return
				const configSource=JSON.parse(input)
				parseServerListSource(configSource)
			},
			input=>{
				storage.setString('servers',input.trim())
			},
			()=>{
				location.reload()
			},
			syntaxDescription,makeSyntaxExamples(serverList.defaultServerListConfig)
		))
	}
}
