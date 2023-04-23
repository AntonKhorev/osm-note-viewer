import type {SimpleStorage} from './util/storage'
import {getStorageString, setStorageString} from './util/storage'
import makeCodeForm from './util/code-form'
import {makeElement} from './util/html'

const syntaxDescription=`<summary>Filter syntax</summary>
<p>URL prefixes each on a new line
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
				setStorageString(storage,'image-sources',input.trim())
				// TODO send to comment parser ?
			},
			()=>{
				// TODO send to comment parser ?
			},
			syntaxDescription,syntaxExamples
		))
	}
}
