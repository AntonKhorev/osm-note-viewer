import NoteViewerStorage from './storage'
import {Note, Users} from './data'
import {toUserQueryPart, NoteQuery, toNoteQueryStatus, toNoteQuerySort, toNoteQueryOrder, getNextFetchDetails} from './query'
import {startFetcher} from './fetch'
import {NoteMap} from './map'
import {makeLink, makeUserLink} from './util'

const storage=new NoteViewerStorage('osm-note-viewer-')

main()

function main(): void {
	const flipped=!!storage.getItem('flipped')
	if (flipped) document.body.classList.add('flipped')
	const $textSide=document.createElement('div')
	$textSide.id='text'
	const $mapSide=document.createElement('div')
	$mapSide.id='map'
	document.body.append($textSide,$mapSide)

	const $scrollingPart=document.createElement('div')
	$scrollingPart.classList.add('scrolling')
	const $stickyPart=document.createElement('div')
	$stickyPart.classList.add('sticky')
	$textSide.append($scrollingPart,$stickyPart)

	const $fetchContainer=document.createElement('div')
	$fetchContainer.classList.add('panel','fetch')
	const $extrasContainer=document.createElement('div')
	$extrasContainer.classList.add('panel')
	const $notesContainer=document.createElement('div')
	$notesContainer.classList.add('notes')
	const $moreContainer=document.createElement('div')
	$moreContainer.classList.add('more')
	const $commandContainer=document.createElement('div')
	$commandContainer.classList.add('panel','command')
	
	$scrollingPart.append($fetchContainer,$extrasContainer,$notesContainer,$moreContainer)
	$stickyPart.append($commandContainer)

	const map=new NoteMap($mapSide)
	writeFlipLayoutButton($fetchContainer,map)
	const $formInputs=writeFetchForm($fetchContainer,$extrasContainer,$notesContainer,$moreContainer,$commandContainer,map)
	writeStoredQueryResults($extrasContainer,$notesContainer,$moreContainer,$commandContainer,map,...$formInputs)
}

function writeFlipLayoutButton($container: HTMLElement, map: NoteMap): void {
	const $button=document.createElement('button')
	$button.classList.add('flip')
	$button.title=`Flip layout`
	$button.addEventListener('click',()=>{
		document.body.classList.toggle('flipped')
		if (document.body.classList.contains('flipped')) {
			storage.setItem('flipped','1')
		} else {
			storage.removeItem('flipped')
		}
		map.invalidateSize()
	})
	$container.append($button)
}

function writeFetchForm(
	$container: HTMLElement, $extrasContainer: HTMLElement, $notesContainer: HTMLElement, $moreContainer: HTMLElement, $commandContainer: HTMLElement,
	map: NoteMap
): [$limitSelect: HTMLSelectElement, $autoLoadCheckbox: HTMLInputElement, $fetchButton: HTMLButtonElement] {
	const partialQuery: Partial<NoteQuery> = {}
	try {
		const queryString=storage.getItem('query')
		if (queryString!=null) {
			const parsedQuery=JSON.parse(queryString)
			if (typeof parsedQuery == 'object') {
				Object.assign(partialQuery,parsedQuery)
			}
		}
	} catch {}
	const $form=document.createElement('form')
	const $userInput=document.createElement('input')
	const $statusSelect=document.createElement('select')
	const $sortSelect=document.createElement('select')
	const $orderSelect=document.createElement('select')
	const $limitSelect=document.createElement('select')
	const $autoLoadCheckbox=document.createElement('input')
	const $fetchButton=document.createElement('button')
	{
		const $fieldset=document.createElement('fieldset')
		{
			const $legend=document.createElement('legend')
			$legend.textContent=`Scope and order`
			$fieldset.append($legend)
		}{
			$userInput.type='text'
			$userInput.name='user'
			$userInput.required=true
			if (partialQuery.userType=='id' && partialQuery.uid!=null) {
				$userInput.value='#'+partialQuery.uid
			} else if (partialQuery.userType=='name' && partialQuery.username!=null) {
				$userInput.value=partialQuery.username
			}
			const $div=document.createElement('div')
			const $label=document.createElement('label')
			$label.append(`OSM username, URL or #id: `,$userInput)
			$div.append($label)
			$fieldset.append($div)
		}{
			const $div=document.createElement('div')
			$statusSelect.append(
				new Option(`both open and closed`,'mixed'),
				new Option(`open and recently closed`,'recent'),
				new Option(`only open`,'open'),
				// new Option(`open followed by closed`,'separate') // TODO requires two fetch phases
			)
			if (partialQuery.status!=null) $statusSelect.value=partialQuery.status
			$sortSelect.append(
				new Option(`creation`,'created_at'),
				new Option(`last update`,'updated_at')
			)
			if (partialQuery.sort!=null) $sortSelect.value=partialQuery.sort
			$orderSelect.append(
				new Option('newest'),
				new Option('oldest')
			)
			if (partialQuery.order!=null) $orderSelect.value=partialQuery.order
			$div.append(
				span(`Fetch this user's `,$statusSelect,` notes`),` `,
				span(`sorted by `,$sortSelect,` date`),`, `,
				span($orderSelect,` first`)
			)
			$fieldset.append($div)
			function span(...items: Array<string|HTMLElement>): HTMLSpanElement {
				const $span=document.createElement('span')
				$span.append(...items)
				return $span
			}
		}
		$form.append($fieldset)
	}{
		const $fieldset=document.createElement('fieldset')
		{
			const $legend=document.createElement('legend')
			$legend.textContent=`Download mode (can change anytime)`
			$fieldset.append($legend)
		}{
			const $div=document.createElement('div')
			$limitSelect.append(
				new Option('20'),
				new Option('100'),
				new Option('500'),
				new Option('2500')
			)
			$div.append(
				`Download these in batches of `,$limitSelect,` notes`
			)
			$fieldset.append($div)
		}{
			$autoLoadCheckbox.type='checkbox'
			$autoLoadCheckbox.checked=true
			const $div=document.createElement('div')
			const $label=document.createElement('label')
			$label.append($autoLoadCheckbox,` Automatically load more notes when scrolled to the end of the table`)
			$div.append($label)
			$fieldset.append($div)
		}
		$form.append($fieldset)
	}{
		$fetchButton.textContent=`Fetch notes`
		$fetchButton.type='submit'
		const $div=document.createElement('div')
		$div.append($fetchButton)
		$form.append($div)
	}
	$userInput.addEventListener('input',()=>{
		const uqp=toUserQueryPart($userInput.value)
		if (uqp.userType=='invalid') {
			$userInput.setCustomValidity(uqp.message)
		} else {
			$userInput.setCustomValidity('')
		}
	})
	$form.addEventListener('submit',(ev)=>{
		ev.preventDefault()
		const uqp=toUserQueryPart($userInput.value)
		if (uqp.userType=='invalid') return
		const query: NoteQuery = {
			...uqp,
			status: toNoteQueryStatus($statusSelect.value),
			sort: toNoteQuerySort($sortSelect.value),
			order: toNoteQueryOrder($orderSelect.value),
			beganAt: Date.now()
		}
		rewriteExtras($extrasContainer,query,Number($limitSelect.value))
		startFetcher(
			saveToQueryStorage,
			$notesContainer,$moreContainer,$commandContainer,
			map,
			$limitSelect,$autoLoadCheckbox,$fetchButton,
			query,[],{}
		)
	})
	$container.append($form)
	return [$limitSelect,$autoLoadCheckbox,$fetchButton]
}

function writeStoredQueryResults(
	$extrasContainer: HTMLElement, $notesContainer: HTMLElement, $moreContainer: HTMLElement, $commandContainer: HTMLElement,
	map: NoteMap,
	$limitSelect: HTMLSelectElement, $autoLoadCheckbox: HTMLInputElement, $fetchButton: HTMLButtonElement
): void {
	const queryString=storage.getItem('query')
	if (queryString==null) {
		rewriteExtras($extrasContainer)
		return
	}
	try {
		const query=JSON.parse(queryString)
		rewriteExtras($extrasContainer,query,Number($limitSelect.value))
		const notesString=storage.getItem('notes')
		if (notesString==null) return
		const usersString=storage.getItem('users')
		if (usersString==null) return
		const notes=JSON.parse(notesString)
		const users=JSON.parse(usersString)
		startFetcher(
			saveToQueryStorage,
			$notesContainer,$moreContainer,$commandContainer,
			map,
			$limitSelect,$autoLoadCheckbox,$fetchButton,
			query,notes,users
		)
	} catch {}
}

function saveToQueryStorage(query: NoteQuery, notes: Note[], users: Users): void {
	storage.setItem('query',JSON.stringify(query))
	storage.setItem('notes',JSON.stringify(notes))
	storage.setItem('users',JSON.stringify(users))
}

function rewriteExtras($container: HTMLElement, query?: NoteQuery, limit?: number): void {
	$container.innerHTML=''
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
			storage.clear()
		})
		$computeButton.addEventListener('click',()=>{
			const size=storage.computeSize()
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
	$container.append($details)
}
