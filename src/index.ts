import NoteViewerStorage from './storage'
import type {Note, NoteComment, Users} from './data'
import {NoteMap} from './map'
import writeNotesTableAndMap from './table'
import {makeLink, makeUserLink} from './util'

const storage=new NoteViewerStorage('osm-note-viewer-')

/**
 * notes as received from the server
 */
interface NoteFeatureCollection {
	type: "FeatureCollection"
	features: NoteFeature[]
}

function isNoteFeatureCollection(data: any): data is NoteFeatureCollection {
	return data.type=="FeatureCollection"
}

/**
 * single note as received from the server
 */
interface NoteFeature {
	geometry: {
		coordinates: [lon: number, lat: number]
	}
	properties: {
		id: number
		status: 'open' | 'closed' | 'hidden'
		comments: NoteFeatureComment[]
	}
}

/**
 * single note comment as received from the server
 */
interface NoteFeatureComment {
	date: string
	uid?: number
	user?: string
	action: 'opened' | 'closed' | 'reopened' | 'commented' | 'hidden'
	text: string
}

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
	const $notesContainer=document.createElement('div')
	$notesContainer.classList.add('notes')
	const $commandContainer=document.createElement('div')
	$commandContainer.classList.add('panel','command')
	
	$scrollingPart.append($fetchContainer,$notesContainer)
	$stickyPart.append($commandContainer)

	const map=new NoteMap($mapSide)
	writeFlipLayoutButton($fetchContainer,map)
	writeFetchForm($fetchContainer,$notesContainer,$commandContainer,map)
	writeStoredQueryResults($notesContainer,$commandContainer,map)
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

function writeFetchForm($container: HTMLElement, $notesContainer: HTMLElement, $commandContainer: HTMLElement, map: NoteMap): void {
	const $form=document.createElement('form')
	const $userInput=document.createElement('input')
	const $fetchButton=document.createElement('button')
	const $fetchAllButton=document.createElement('button')
	{
		const username=storage.getItem('user')
		$userInput.type='text'
		$userInput.name='user'
		if (username) $userInput.value=username
		const $div=document.createElement('div')
		const $label=document.createElement('label')
		$label.append(`OSM username: `,$userInput)
		$div.append($label)
		$form.append($div)
	}{
		$fetchButton.textContent=`Fetch notes`
		$fetchButton.type='submit'
		$fetchAllButton.textContent=`Fetch all notes`
		$fetchAllButton.type='submit'
		const $div=document.createElement('div')
		$div.append($fetchButton,` `,$fetchAllButton)
		$form.append($div)
	}
	$form.addEventListener('submit',async(ev)=>{
		ev.preventDefault()
		let limit=20
		if (ev.submitter===$fetchAllButton) {
			limit=10000
		}
		$fetchButton.disabled=true
		$fetchAllButton.disabled=true
		const username=$userInput.value
		if (username) {
			storage.setItem('user',username)
		} else {
			storage.removeItem('user')
		}
		clearRequestStorage()
		map.clearNotes()
		$notesContainer.innerHTML=``
		$commandContainer.innerHTML=``
		writeExtras($notesContainer,username)
		writeMessage($notesContainer,`Loading notes of user `,[username],` ...`)
		const url=`https://api.openstreetmap.org/api/0.6/notes/search.json?closed=-1&sort=created_at&limit=${encodeURIComponent(limit)}&display_name=${encodeURIComponent(username)}`
		try {
			const requestBeganAt=new Date().toJSON()
			const response=await fetch(url)
			if (!response.ok) {
				const responseText=await response.text()
				$notesContainer.innerHTML=``
				$commandContainer.innerHTML=``
				writeExtras($notesContainer,username)
				writeErrorMessage($notesContainer,username,`received the following error response`,responseText)
			} else {
				const data=await response.json()
				const requestEndedAt=new Date().toJSON()
				if (!isNoteFeatureCollection(data)) return
				const [notes,users]=transformFeatureCollectionToNotesAndUsers(data)
				saveToRequestStorage(requestBeganAt,requestEndedAt,notes,users)
				$notesContainer.innerHTML=``
				$commandContainer.innerHTML=``
				writeExtras($notesContainer,username)
				writeQueryResults($notesContainer,$commandContainer,map,username,notes,users)
			}
		} catch (ex) {
			$notesContainer.innerHTML=``
			$commandContainer.innerHTML=``
			if (ex instanceof TypeError) {
				writeErrorMessage($notesContainer,username,`failed with the following error before receiving a response`,ex.message)
			} else {
				writeErrorMessage($notesContainer,username,`failed for unknown reason`,`${ex}`)
			}
		}
		$fetchAllButton.disabled=false
		$fetchButton.disabled=false
	})
	$container.append($form)
}

function writeStoredQueryResults($notesContainer: HTMLElement, $commandContainer: HTMLElement, map: NoteMap): void {
	const username=storage.getItem('user')
	if (username==null) {
		writeExtras($notesContainer)
		return
	}
	writeExtras($notesContainer,username)
	const requestBeganAt=storage.getItem('request-began-at')
	if (requestBeganAt==null) return
	const requestEndedAt=storage.getItem('request-ended-at')
	if (requestEndedAt==null) return
	const notesString=storage.getItem('notes')
	if (notesString==null) return
	const usersString=storage.getItem('users')
	if (usersString==null) return
	try {
		const notes=JSON.parse(notesString)
		const users=JSON.parse(usersString)
		writeQueryResults($notesContainer,$commandContainer,map,username,notes,users)
	} catch {}
}

function writeQueryResults(
	$notesContainer: HTMLElement, $commandContainer: HTMLElement, map: NoteMap,
	username: string, notes: Note[], users: Users
): void {
	if (notes.length>0) {
		writeNotesTableAndMap($notesContainer,$commandContainer,map,notes,users)
		map.fitNotes()
	} else {
		writeMessage($notesContainer,`User `,[username],` has no notes`)
	}
}

function transformFeatureCollectionToNotesAndUsers(data: NoteFeatureCollection): [Note[], Users] {
	const users: Users = {}
	const notes=data.features.map(noteFeature=>({
		id: noteFeature.properties.id,
		lat: noteFeature.geometry.coordinates[1],
		lon: noteFeature.geometry.coordinates[0],
		status: noteFeature.properties.status,
		comments: noteFeature.properties.comments.map(cullCommentProps)
	}))
	return [notes,users]
	function cullCommentProps(a: NoteFeatureComment): NoteComment {
		const b:NoteComment={
			date: transformDate(a.date),
			action: a.action,
			text: a.text
		}
		if (a.uid!=null) {
			b.uid=a.uid
			if (a.user!=null) users[a.uid]=a.user
		}
		return b
	}
	function transformDate(a: string): number {
		const match=a.match(/^\d\d\d\d-\d\d-\d\d\s+\d\d:\d\d:\d\d/)
		if (!match) return 0 // shouldn't happen
		const [s]=match
		return Date.parse(s)/1000
	}
	function transformCoords([lon,lat]: [number,number]): [lat: number, lon: number] {
		return [lat,lon]
	}
}

function clearRequestStorage(): void {
	storage.removeItem('request-began-at')
	storage.removeItem('request-ended-at')
	storage.removeItem('notes')
	storage.removeItem('users')
}

function saveToRequestStorage(requestBeganAt: string, requestEndedAt: string, notes: Note[], users: Users): void {
	storage.setItem('request-began-at',requestBeganAt)
	storage.setItem('request-ended-at',requestEndedAt)
	storage.setItem('notes',JSON.stringify(notes))
	storage.setItem('users',JSON.stringify(users))
}

function writeMessage($container: HTMLElement, ...items: Array<string|[string]>): void {
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

function writeErrorMessage($container: HTMLElement, username: string, responseKindText: string, errorText: string): void {
	writeMessage($container,`Loading notes of user `,[username],` ${responseKindText}:`)
	const $error=document.createElement('pre')
	$error.textContent=errorText
	$container.append($error)
}

function writeExtras($container: HTMLElement, username?: string): void {
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
		`, `,
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
	function writeBlock(makeBlockContents: ()=>Array<Node|string>): void {
		const $block=document.createElement('div')
		$block.append(...makeBlockContents())
		$details.append($block)
	}
	$container.append($details)
}
