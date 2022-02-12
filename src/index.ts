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
	const $controlsContainer=document.getElementById('controls-container')
	if (!($controlsContainer instanceof HTMLElement)) return
	const $notesContainer=document.getElementById('notes-container')
	if (!($notesContainer instanceof HTMLElement)) return
	const $mapContainer=document.getElementById('map-container')
	if (!($mapContainer instanceof HTMLElement)) return
	const map=installMap($mapContainer)
	const mapNoteLayer=L.featureGroup().addTo(map)
	writeFlipPanesButton($controlsContainer,map)
	writeFetchForm($controlsContainer,$notesContainer,map,mapNoteLayer)
}

function writeFlipPanesButton($container: HTMLElement, map: L.Map): void {
	const $div=document.createElement('div')
	const $button=document.createElement('button')
	$button.textContent=`Flip panes`
	$button.addEventListener('click',()=>{
		document.body.classList.toggle('flipped')
		map.invalidateSize()
	})
	$div.append($button)
	$container.append($div)
}

function writeFetchForm($container: HTMLElement, $notesContainer: HTMLElement, map: L.Map, mapNoteLayer: L.FeatureGroup): void {
	const $form=document.createElement('form')
	const $userInput=document.createElement('input')
	const $fetchButton=document.createElement('button')
	const $fetchAllButton=document.createElement('button')
	{
		$userInput.type='text'
		$userInput.name='user'
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
		$notesContainer.innerHTML=``
		writeMessage($notesContainer,`Loading notes of user `,[username],` ...`)
		const url=`https://api.openstreetmap.org/api/0.6/notes/search.json?closed=-1&sort=created_at&limit=${encodeURIComponent(limit)}&display_name=${encodeURIComponent(username)}`
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
				mapNoteLayer.clearLayers()
				writeExtras($notesContainer,username)
				if (data.features.length>0) {
					writeNotesTableAndMap($notesContainer,mapNoteLayer,data.features)
					map.fitBounds(mapNoteLayer.getBounds())
				} else {
					writeMessage($notesContainer,`User `,[username],` has no notes`)
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
		$fetchAllButton.disabled=false
		$fetchButton.disabled=false
	})
	$container.append($form)
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

function writeNotesTableAndMap($container: HTMLElement, layer: L.FeatureGroup, notes: NoteFeature[]): void {
	const $table=document.createElement('table')
	$container.append($table)
	{
		const $header=$table.createTHead()
		const $row=$header.insertRow()
		$row.append(
			makeHeaderCell('id'),
			makeHeaderCell('date'),
			makeHeaderCell('user'),
			makeHeaderCell(''),
			makeHeaderCell('comment')
		)
	}
	for (const note of notes) {
		const marker=L.marker([note.geometry.coordinates[1],note.geometry.coordinates[0]],{
			alt: `note`,
			opacity: 0.5
		}).addTo(layer)
		const $rowGroup=$table.createTBody()
		$rowGroup.dataset.layerId=String(layer.getLayerId(marker))
		$rowGroup.addEventListener('mouseover',noteRowsMouseoverListener)
		$rowGroup.addEventListener('mouseout' ,noteRowsMouseoutListener)
		let $row=$rowGroup.insertRow()
		{
			const $cell=$row.insertCell()
			const nComments=note.properties.comments.length
			if (nComments>1) $cell.rowSpan=nComments
			const $a=document.createElement('a')
			$a.href=`https://www.openstreetmap.org/note/`+encodeURIComponent(note.properties.id)
			$a.textContent=`${note.properties.id}`
			$cell.append($a)
		}
		let firstCommentRow=true
		for (const comment of note.properties.comments) {
			{
				if (firstCommentRow) {
					firstCommentRow=false
				} else {
					$row=$rowGroup.insertRow()
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
	function noteRowsMouseoverListener(this: HTMLElement): void {
		const layerId=Number(this.dataset.layerId)
		const marker=layer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		marker.setOpacity(1)
	}
	function noteRowsMouseoutListener(this: HTMLElement): void {
		const layerId=Number(this.dataset.layerId)
		const marker=layer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		marker.setOpacity(0.5)
	}
}

function installMap($container: HTMLElement): L.Map {
	return L.map($container).addLayer(L.tileLayer(
		'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
		{attribution: "© <a href=https://www.openstreetmap.org/copyright>OpenStreetMap contributors</a>"}
	)).fitWorld()
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
