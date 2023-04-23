import type {SimpleStorage} from './util/storage'
import {getStorageString, setStorageString} from './util/storage'
import makeCodeForm from './util/code-form'
import {makeElement} from './util/html'

const syntaxDescription=`<summary>What this is</summary>
<ul>
<li>Used to look for links to images in note comments
<li>Used in the <em>Load and show images</em> feature
<li>The input is URL prefixes each on a new line
<li>Set to completely empty input to use defaults (currently StreetComplete)
<li>Set to (at least one) empty line to disable
</ul>
`

const syntaxExamples: [string,string[]][] = [
	[`StreetComplete`,[`https://westnordost.de/p/`]],
	[`MapComplete`,[`https://i.imgur.com/`]],
	[`en.osm.town Mastodon instance`,[`https://cdn.masto.host/enosmtown/`]]
]

export default class ImageSection {
	constructor(
		$section: HTMLElement,
		storage: SimpleStorage
	) {
		$section.append(
			makeElement('h2')()(`Trusted image sources`)
		)
		$section.append(makeCodeForm(
			getStorageString(storage,'image-sources'),'',
			`Trusted image sources`,`URL prefixes`,`Apply changes`,
			input=>input==getStorageString(storage,'image-sources'),
			input=>{
				// TODO check syntax - should be https urls
			},
			input=>{
				setStorageString(storage,'image-sources',input)
			},
			()=>{
				location.reload()
			},
			syntaxDescription,syntaxExamples
		))
	}
}
