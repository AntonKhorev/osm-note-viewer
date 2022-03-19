import NoteViewerStorage from './storage'
import {NoteQuery, getNextFetchDetails} from './query'
import {makeLink, makeUserLink} from './util'

export default class ExtrasPanel {
	constructor(private storage: NoteViewerStorage, private $container: HTMLElement) {}
	rewrite(query?: NoteQuery, limit?: number): void {
		this.$container.innerHTML=''
		const $details=document.createElement('details')
		{
			const $summary=document.createElement('summary')
			$summary.textContent=`Extra information`
			$details.append($summary)
		}
		writeBlock(()=>{
			const $clearButton=document.createElement('button')
			$clearButton.textContent=`Clear storage`
			const $computeButton=document.createElement('button')
			$computeButton.textContent=`Compute storage size`
			const $computeResult=document.createElement('span')
			$clearButton.addEventListener('click',()=>{
				this.storage.clear()
			})
			$computeButton.addEventListener('click',()=>{
				const size=this.storage.computeSize()
				$computeResult.textContent=(size/1024).toFixed(2)+" KB"
			})
			return [$clearButton,` `,$computeButton,` `,$computeResult]
		})
		if (query!=null && limit!=null) writeBlock(()=>[
			`API links to queries on `,
			makeUserLink(query,`this user`),
			`: `,
			makeNoteQueryLink(`with specified limit`,query,limit),
			`, `,
			makeNoteQueryLink(`with max limit`,query,10000),
			` (may be slow)`
		])
		writeBlock(()=>[
			`User query have whitespace trimmed, then the remaining part starting with `,makeCode(`#`),` is treated as a user id; containing `,makeCode(`/`),`is treated as a URL, anything else as a username. `,
			`This works because usernames can't contain any of these characters: `,makeCode(`/;.,?%#`),` , can't have leading/trailing whitespace, have to be between 3 and 255 characters in length.`
		])
		writeBlock(()=>[
			`Notes documentation: `,
			makeLink(`wiki`,`https://wiki.openstreetmap.org/wiki/Notes`),
			`, `,
			makeLink(`API`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Map_Notes_API`),
			` (`,
			makeLink(`search`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Search_for_notes:_GET_.2Fapi.2F0.6.2Fnotes.2Fsearch`),
			`), `,
			makeLink(`GeoJSON`,`https://wiki.openstreetmap.org/wiki/GeoJSON`),
			` (output format used for notes/search.json api calls)`
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
			makeLink(`Source code`,`https://github.com/AntonKhorev/osm-note-viewer`)
		])
		function writeBlock(makeBlockContents: ()=>Array<Node|string>): void {
			const $block=document.createElement('div')
			$block.append(...makeBlockContents())
			$details.append($block)
		}
		function makeCode(s: string): HTMLElement {
			const $code=document.createElement('code')
			$code.textContent=s
			return $code
		}
		function makeNoteQueryLink(text: string, query: NoteQuery, limit: number): HTMLAnchorElement {
			return makeLink(text,`https://api.openstreetmap.org/api/0.6/notes/search.json?`+getNextFetchDetails(query,limit).parameters)
		}
		this.$container.append($details)
	}
}
