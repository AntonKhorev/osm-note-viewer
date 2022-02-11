/// <reference path="../node_modules/@types/leaflet/index.d.ts" />

main()

interface NoteFeatureCollection {
	type: "FeatureCollection"
	features: NoteFeature[]
}

interface NoteFeature {
	geometry: {
		coordinates: [lon: number, lat: number]
	}
	properties: {
		id: number
		comments: NoteComment[]
	}
}

interface NoteComment {
	date: string
	user?: string
	action: 'opened' | 'closed' | 'reopened' | 'commented' | 'hidden'
	text: string
}

function main(): void {
	installFlipPanesHandler()
	const $fetchNotesForm=document.getElementById('fetch-notes')
	if (!($fetchNotesForm instanceof HTMLFormElement)) return
	const $notesContainer=document.getElementById('notes-container')
	if (!($notesContainer instanceof HTMLElement)) return
	const $mapContainer=document.getElementById('map-container')
	if (!($mapContainer instanceof HTMLElement)) return
	const $usernameInput=document.getElementById('username')
	if (!($usernameInput instanceof HTMLInputElement)) return
	const $submitButton=document.getElementById('fetch-submit')
	if (!($submitButton instanceof HTMLButtonElement)) return
	const map=installMap($mapContainer)
	const mapNoteLayer=L.featureGroup().addTo(map)
	$fetchNotesForm.addEventListener('submit',async(ev)=>{
		ev.preventDefault()
		$submitButton.disabled=true
		const username=$usernameInput.value
		$notesContainer.innerHTML=``
		writeMessage($notesContainer,`Loading notes of user `,[username],` ...`)
		const url=`https://api.openstreetmap.org/api/0.6/notes/search.json?closed=-1&sort=created_at&limit=20&display_name=${encodeURIComponent(username)}`
		try {
			const response=await fetch(url)
			if (!response.ok) {
				const responseText=await response.text()
				$notesContainer.innerHTML=``
				writeErrorMessage($notesContainer,username,`received the following error response`,responseText)
			} else {
				const data=await response.json()
				if (!isNoteFeatureCollection(data)) return
				$notesContainer.innerHTML=``
				writeExtras($notesContainer,username)
				if (data.features.length>0) {
					writeNotesTable($notesContainer,data.features)
				} else {
					writeMessage($notesContainer,`User `,[username],` has no notes`)
				}
				mapNoteLayer.clearLayers()
				if (data.features.length>0) {
					addNotesToMapLayer(mapNoteLayer,data)
					map.fitBounds(mapNoteLayer.getBounds())
				}
			}
		} catch (ex) {
			$notesContainer.innerHTML=``
			if (ex instanceof TypeError) {
				writeErrorMessage($notesContainer,username,`failed with the following error before receiving a response`,ex.message)
			} else {
				writeErrorMessage($notesContainer,username,`failed for unknown reason`,`${ex}`)
			}
		}
		$submitButton.disabled=false
	})
}

function installFlipPanesHandler() {
	const $button=document.getElementById('flip-panes')
	if (!($button instanceof HTMLButtonElement)) return
	$button.addEventListener('click',()=>{
		document.body.classList.toggle('flipped')
	})
}

function isNoteFeatureCollection(data: any): data is NoteFeatureCollection {
	return data.type=="FeatureCollection"
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

function writeExtras($container: HTMLElement, username: string): void {
	const $details=document.createElement('details')
	{
		const $summary=document.createElement('summary')
		$summary.textContent=`Extra links`
		$details.append($summary)
	}{
		const $links=document.createElement('div')
		$links.append(
			`Fetch up to 10000 notes of `,
			makeLink(`this user`,`https://www.openstreetmap.org/user/${encodeURIComponent(username)}`),
			` (may be slow): `,
			makeLink(`json`,`https://api.openstreetmap.org/api/0.6/notes/search.json?closed=-1&sort=created_at&limit=10000&display_name=${encodeURIComponent(username)}`)
		)
		$details.append($links)
	}{
		const $links=document.createElement('div')
		$links.append(
			`Notes documentation: `,
			makeLink(`wiki`,`https://wiki.openstreetmap.org/wiki/Notes`),
			`, `,
			makeLink(`api`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Map_Notes_API`),
			`, `,
			makeLink(`GeoJSON`,`https://wiki.openstreetmap.org/wiki/GeoJSON`),
			` (output format used for notes/search.json api calls)`
		)
		$details.append($links)
	}{
		const $links=document.createElement('div')
		$links.append(
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
		)
		$details.append($links)
	}
	$container.append($details)
}

function writeNotesTable($container: HTMLElement, notes: NoteFeature[]): void {
	const $table=document.createElement('table')
	$container.append($table)
	{
		const $row=$table.insertRow()
		$row.append(
			makeHeaderCell('id'),
			makeHeaderCell('date'),
			makeHeaderCell('user'),
			makeHeaderCell(''),
			makeHeaderCell('comment')
		)
	}
	for (const note of notes) {
		let firstCommentRow=true
		for (const comment of note.properties.comments) {
			const $row=$table.insertRow()
			{
				const $cell=$row.insertCell()
				if (firstCommentRow) {
					firstCommentRow=false
					const $a=document.createElement('a')
					$a.href=`https://www.openstreetmap.org/note/`+encodeURIComponent(note.properties.id)
					$a.textContent=`${note.properties.id}`
					$cell.append($a)
				}
			}{
				const $cell=$row.insertCell()
				// "2022-02-09 22:46:20 UTC"
				const match=comment.date.match(/^(\d\d\d\d-\d\d-\d\d)\s+(\d\d:\d\d:\d\d)/)
				if (match) {
					const [,date,time]=match
					const $dateTime=document.createElement('time')
					$dateTime.textContent=date
					$dateTime.dateTime=`${date} ${time}Z`
					$dateTime.title=comment.date
					$cell.append($dateTime)
				} else {
					const $unknownDateTime=document.createElement('span')
					$unknownDateTime.textContent=`?`
					$unknownDateTime.title=comment.date
					$cell.append($unknownDateTime)
				}
			}{
			}{
				const $cell=$row.insertCell()
				$cell.classList.add('note-user')
				if (comment.user!=null) {
					$cell.append(makeUserLink(comment.user))
				}
			}{
				const $cell=$row.insertCell()
				$cell.classList.add('note-action')
				const $icon=document.createElement('span')
				$icon.title=comment.action
				$icon.classList.add('icon',getActionClass(comment))
				$cell.append($icon)
				function getActionClass(comment: NoteComment): string {
					if (comment.action=='opened' || comment.action=='reopened') {
						return 'open'
					} else if (comment.action=='closed' || comment.action=='hidden') {
						return 'close'
					} else {
						return 'other'
					}
				}
			}{
				const $cell=$row.insertCell()
				$cell.classList.add('note-comment')
				$cell.textContent=comment.text
			}
		}
	}
	function makeHeaderCell(text: string): HTMLTableCellElement {
		const $cell=document.createElement('th')
		$cell.textContent=text
		return $cell
	}
}

function installMap($container: HTMLElement): L.Map {
	return L.map($container).addLayer(L.tileLayer(
		'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		{attribution: "© <a href=https://www.openstreetmap.org/copyright>OpenStreetMap contributors</a>"}
	)).fitWorld()
}

function addNotesToMapLayer(layer: L.FeatureGroup<any>, noteCollection: NoteFeatureCollection): void {
	L.geoJSON(noteCollection).addTo(layer)
}

function makeUserLink(username: string): HTMLAnchorElement {
	return makeLink(username,`https://www.openstreetmap.org/user/${encodeURIComponent(username)}`)
}

function makeLink(text: string, href: string): HTMLAnchorElement {
	const $link=document.createElement('a')
	$link.href=href
	$link.textContent=text
	return $link
}
