import NoteViewerStorage from './storage'
import {Note, NoteComment, Users, isNoteFeatureCollection, transformFeatureCollectionToNotesAndUsers} from './data'
import {NoteQuery, NoteFetchDetails, toNoteQueryStatus, toNoteQuerySort, toNoteQueryOrder, getNextFetchDetails} from './query'
import {NoteMap} from './map'
import writeNotesTableAndMap from './table'
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
	writeFetchForm($fetchContainer,$extrasContainer,$notesContainer,$moreContainer,$commandContainer,map)
	writeStoredQueryResults($extrasContainer,$notesContainer,$moreContainer,$commandContainer,map)
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

function writeFetchForm($container: HTMLElement, $extrasContainer: HTMLElement, $notesContainer: HTMLElement, $moreContainer: HTMLElement, $commandContainer: HTMLElement, map: NoteMap): void {
	const query: NoteQuery = {
		user: '',
		status: 'mixed',
		sort: 'created_at',
		order: 'newest',
		limit: 20,
	}
	try {
		const queryString=storage.getItem('query')
		if (queryString!=null) {
			const parsedQuery=JSON.parse(queryString)
			if (typeof parsedQuery == 'object') {
				Object.assign(query,parsedQuery)
			}
		}
	} catch {}
	const $form=document.createElement('form')
	const $userInput=document.createElement('input')
	const $statusSelect=document.createElement('select')
	const $sortSelect=document.createElement('select')
	const $orderSelect=document.createElement('select')
	const $limitSelect=document.createElement('select')
	const $fetchButton=document.createElement('button')
	{
		$userInput.type='text'
		$userInput.name='user'
		$userInput.value=query.user
		const $div=document.createElement('div')
		const $label=document.createElement('label')
		$label.append(`OSM username: `,$userInput)
		$div.append($label)
		$form.append($div)
	}{
		const $div=document.createElement('div')
		$statusSelect.append(
			new Option(`both open and closed`,'mixed'),
			new Option(`only open`,'open'),
			// new Option(`open followed by closed`,'separate') // TODO requires two fetch phases
		)
		$statusSelect.value=query.status
		$sortSelect.append(
			new Option(`creation`,'created_at'),
			new Option(`last update`,'updated_at')
		)
		$sortSelect.value=query.sort
		$orderSelect.append(
			new Option('newest'),
			new Option('oldest')
		)
		$orderSelect.value=query.order
		$limitSelect.append(
			new Option('20'),
			new Option('100'),
			new Option('500'),
			new Option('2500')
		)
		$limitSelect.value=String(query.limit)
		$div.append(
			span(`Fetch `,$statusSelect,` notes`),` `,
			span(`sorted by `,$sortSelect,` date`),`, `,
			span($orderSelect,` first`),`, `,
			span(`in batches of `,$limitSelect,` notes`)
		)
		$form.append($div)
		function span(...items: Array<string|HTMLElement>): HTMLSpanElement {
			const $span=document.createElement('span')
			$span.append(...items)
			return $span
		}
	}{
		$fetchButton.textContent=`Fetch notes`
		$fetchButton.type='submit'
		const $div=document.createElement('div')
		$div.append($fetchButton)
		$form.append($div)
	}
	$form.addEventListener('submit',async(ev)=>{
		ev.preventDefault()
		query.user=$userInput.value
		query.status=toNoteQueryStatus($statusSelect.value)
		query.sort=toNoteQuerySort($sortSelect.value)
		query.order=toNoteQueryOrder($orderSelect.value)
		query.limit=Number($limitSelect.value)
		query.beganAt=Date.now()
		query.endedAt=undefined
		const seenNotes: {[id: number]: boolean} = {}
		const notes: Note[] = []
		const users: Users = {}
		saveToQueryStorage(query,notes,users)
		map.clearNotes()
		$notesContainer.innerHTML=``
		$commandContainer.innerHTML=``
		rewriteExtras($extrasContainer,query.user)
		let lastNote: Note | undefined
		let prevLastNote: Note | undefined
		let lastLimit: number | undefined
		await fetchCycle()
		async function fetchCycle() {
			rewriteMessage($moreContainer,`Loading notes of user `,[query.user],` ...`)
			const fetchDetails=getNextFetchDetails(query,lastNote,prevLastNote,lastLimit)
			if (fetchDetails.limit>10000) {
				rewriteMessage($moreContainer,`Fetching cannot continue because the required note limit exceeds max value allowed by API (this is very unlikely, if you see this message it's probably a bug)`)
				return
			}
			const url=`https://api.openstreetmap.org/api/0.6/notes/search.json?`+fetchDetails.parameters
			$fetchButton.disabled=true
			try {
				const response=await fetch(url)
				if (!response.ok) {
					const responseText=await response.text()
					rewriteErrorMessage($moreContainer,query.user,`received the following error response`,responseText)
				} else {
					const data=await response.json()
					query.endedAt=Date.now()
					if (!isNoteFeatureCollection(data)) {
						rewriteMessage($moreContainer,`Received invalid data`)
						return
					}
					mergeNotesAndUsers(...transformFeatureCollectionToNotesAndUsers(data))
					saveToQueryStorage(query,notes,users)
					if (!lastNote) { // first iteration
						if (notes.length>0) {
							writeNotesTableAndMap($notesContainer,$commandContainer,map,notes,users)
							map.fitNotes()
						}
					} else {
						// TODO proper append instead of rewriting everything
						map.clearNotes()
						$notesContainer.innerHTML=``
						$commandContainer.innerHTML=``
						writeNotesTableAndMap($notesContainer,$commandContainer,map,notes,users)
					}
					if (data.features.length<fetchDetails.limit) {
						if (notes.length==0) {
							rewriteMessage($moreContainer,`User `,[query.user],` has no notes`)
						} else {
							rewriteMessage($moreContainer,`Got all notes`)
						}
						return
					}
					prevLastNote=lastNote
					lastNote=notes[notes.length-1]
					lastLimit=fetchDetails.limit
					$moreContainer.innerHTML=''
					const $moreButton=document.createElement('button')
					$moreButton.textContent=`Load more notes`
					$moreButton.addEventListener('click',fetchCycle)
					$moreContainer.append($moreButton)
				}
			} catch (ex) {
				if (ex instanceof TypeError) {
					rewriteErrorMessage($moreContainer,query.user,`failed with the following error before receiving a response`,ex.message)
				} else {
					rewriteErrorMessage($moreContainer,query.user,`failed for unknown reason`,`${ex}`)
				}
			} finally {
				$fetchButton.disabled=false
			}
		}
		function mergeNotesAndUsers(newNotes: Note[], newUsers: Users): void {
			for (const note of newNotes) {
				if (seenNotes[note.id]) continue
				seenNotes[note.id]=true
				notes.push(note)
			}
			Object.assign(users,newUsers)
		}
	})
	$container.append($form)
}

function writeStoredQueryResults($extrasContainer: HTMLElement, $notesContainer: HTMLElement, $moreContainer: HTMLElement, $commandContainer: HTMLElement, map: NoteMap): void {
	const queryString=storage.getItem('query')
	if (queryString==null) {
		rewriteExtras($extrasContainer)
		return
	}
	try {
		const query=JSON.parse(queryString)
		rewriteExtras($extrasContainer,query.user)
		const notesString=storage.getItem('notes')
		if (notesString==null) return
		const usersString=storage.getItem('users')
		if (usersString==null) return
		const notes=JSON.parse(notesString)
		const users=JSON.parse(usersString)
		if (notes.length>0) {
			writeNotesTableAndMap($notesContainer,$commandContainer,map,notes,users)
			map.fitNotes()
		}
	} catch {}
}

function saveToQueryStorage(query: NoteQuery, notes: Note[], users: Users): void {
	storage.setItem('query',JSON.stringify(query))
	storage.setItem('notes',JSON.stringify(notes))
	storage.setItem('users',JSON.stringify(users))
}

function rewriteMessage($container: HTMLElement, ...items: Array<string|[string]>): void {
	$container.innerHTML=''
	const $message=document.createElement('div')
	for (const item of items) {
		if (Array.isArray(item)) {
			const [username]=item
			$message.append(makeUserLink(username))
		} else {
			$message.append(item)
		}
	}
	$container.append($message)
}

function rewriteErrorMessage($container: HTMLElement, username: string, responseKindText: string, errorText: string): void {
	rewriteMessage($container,`Loading notes of user `,[username],` ${responseKindText}:`)
	const $error=document.createElement('pre')
	$error.textContent=errorText
	$container.append($error)
}

function rewriteExtras($container: HTMLElement, username?: string): void {
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
	if (username!=null) writeBlock(()=>[
		`Fetch up to 10000 notes of `,
		makeLink(`this user`,`https://www.openstreetmap.org/user/${encodeURIComponent(username)}`),
		` (may be slow): `,
		makeLink(`json`,`https://api.openstreetmap.org/api/0.6/notes/search.json?closed=-1&sort=created_at&limit=10000&display_name=${encodeURIComponent(username)}`)
	])
	writeBlock(()=>[
		`Notes documentation: `,
		makeLink(`wiki`,`https://wiki.openstreetmap.org/wiki/Notes`),
		`, `,
		makeLink(`api`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Map_Notes_API`),
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
	$container.append($details)
}
