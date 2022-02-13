/// <reference path="../node_modules/@types/leaflet/index.d.ts" />

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
		comments: NoteComment[]
	}
}

/**
 * single note comment as received from the server / saved in the local storage
 */
interface NoteComment {
	date: string
	uid?: number
	user?: string
	action: 'opened' | 'closed' | 'reopened' | 'commented' | 'hidden'
	text: string
}

/**
 * single note as saved in the local storage
 */
interface Note {
	id: number
	coordinates: [lon: number, lat: number]
	status: 'open' | 'closed' | 'hidden'
	comments: NoteComment[]
}

class NoteMarker extends L.Marker {
	noteId: number
	constructor(note: Note) {
		super(note.coordinates,{
			alt: `note`,
			opacity: 0.5
		})
		this.noteId=note.id
	}
}

main()

function main(): void {
	const flipped=!!localStorage.getItem('flipped')
	if (flipped) document.body.classList.add('flipped')
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
	writeStoredQueryResults($notesContainer,map,mapNoteLayer)
}

function writeFlipPanesButton($container: HTMLElement, map: L.Map): void {
	const $div=document.createElement('div')
	const $button=document.createElement('button')
	$button.textContent=`Flip panes`
	$button.addEventListener('click',()=>{
		document.body.classList.toggle('flipped')
		if (document.body.classList.contains('flipped')) {
			localStorage.setItem('flipped','1')
		} else {
			localStorage.removeItem('flipped')
		}
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
		const username=localStorage.getItem('user')
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
			localStorage.setItem('user',username)
		} else {
			localStorage.removeItem('user')
		}
		clearNoteStorage()
		$notesContainer.innerHTML=``
		writeExtras($notesContainer,username)
		writeMessage($notesContainer,`Loading notes of user `,[username],` ...`)
		const url=`https://api.openstreetmap.org/api/0.6/notes/search.json?closed=-1&sort=created_at&limit=${encodeURIComponent(limit)}&display_name=${encodeURIComponent(username)}`
		try {
			const requestBeganAt=new Date().toJSON()
			const response=await fetch(url)
			if (!response.ok) {
				const responseText=await response.text()
				$notesContainer.innerHTML=``
				writeExtras($notesContainer,username)
				writeErrorMessage($notesContainer,username,`received the following error response`,responseText)
			} else {
				const data=await response.json()
				const requestEndedAt=new Date().toJSON()
				if (!isNoteFeatureCollection(data)) return
				const notes=transformFeatureCollectionToNotes(data)
				saveToNoteStorage(requestBeganAt,requestEndedAt,notes)
				$notesContainer.innerHTML=``
				writeExtras($notesContainer,username)
				mapNoteLayer.clearLayers()
				writeQueryResults($notesContainer,map,mapNoteLayer,username,notes)
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

function writeStoredQueryResults($notesContainer: HTMLElement, map: L.Map, mapNoteLayer: L.FeatureGroup): void {
	const username=localStorage.getItem('user')
	if (username==null) {
		writeExtras($notesContainer)
		return
	}
	writeExtras($notesContainer,username)
	const requestBeganAt=localStorage.getItem('request-began-at')
	if (requestBeganAt==null) return
	const requestEndedAt=localStorage.getItem('request-ended-at')
	if (requestEndedAt==null) return
	const notesString=localStorage.getItem('notes')
	if (notesString==null) return
	try {
		const notes=JSON.parse(notesString)
		writeQueryResults($notesContainer,map,mapNoteLayer,username,notes)
	} catch {}
}

function writeQueryResults($notesContainer: HTMLElement, map: L.Map, mapNoteLayer: L.FeatureGroup, username: string, notes: Note[]): void {
	if (notes.length>0) {
		writeNotesTableAndMap($notesContainer,map,mapNoteLayer,notes)
		map.fitBounds(mapNoteLayer.getBounds())
	} else {
		writeMessage($notesContainer,`User `,[username],` has no notes`)
	}
}

function transformFeatureCollectionToNotes(data: NoteFeatureCollection): Note[] {
	return data.features.map(noteFeature=>({
		id: noteFeature.properties.id,
		coordinates: transformCoords(noteFeature.geometry.coordinates),
		status: noteFeature.properties.status,
		comments: noteFeature.properties.comments.map(cullCommentProps)
	}))
	function cullCommentProps(a: NoteComment): NoteComment {
		const b:NoteComment={
			date: transformDate(a.date),
			action: a.action,
			text: a.text
		}
		if (a.uid!=null) b.uid=a.uid
		if (a.user!=null) b.user=a.user
		return b
	}
	function transformDate(a: string): string {
		const match=a.match(/^(\d\d\d\d)-(\d\d)-(\d\d)\s+(\d\d):(\d\d):(\d\d)/)
		if (!match) return `20000101000000` // shouldn't happen
		const [,Y,M,D,h,m,s]=match
		return Y+M+D+h+m+s
	}
	function transformCoords([lon,lat]: [number,number]): [lat: number, lon: number] {
		return [lat,lon]
	}
}

function clearNoteStorage(): void {
	localStorage.removeItem('request-began-at')
	localStorage.removeItem('request-ended-at')
	localStorage.removeItem('notes')
}

function saveToNoteStorage(requestBeganAt: string, requestEndedAt: string, notes: Note[]): void {
	localStorage.setItem('request-began-at',requestBeganAt)
	localStorage.setItem('request-ended-at',requestEndedAt)
	localStorage.setItem('notes',JSON.stringify(notes))
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
			localStorage.clear()
		})
		$computeButton.addEventListener('click',()=>{
			// https://stackoverflow.com/a/15720835
			let size=0
			for (const k in localStorage) {
				if (!localStorage.hasOwnProperty(k)) continue
				size+=(localStorage[k].length+k.length)*2
			}
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

function writeNotesTableAndMap($container: HTMLElement, map: L.Map, layer: L.FeatureGroup, notes: Note[]): void {
	let currentLayerId: number | undefined
	const $table=document.createElement('table')
	$container.append($table)
	{
		const $header=$table.createTHead()
		const $row=$header.insertRow()
		$row.append(
			makeHeaderCell(''),
			makeHeaderCell('id'),
			makeHeaderCell('date'),
			makeHeaderCell('user'),
			makeHeaderCell(''),
			makeHeaderCell('comment')
		)
	}
	for (const note of notes) {
		const marker=new NoteMarker(note).on('click',markerClickListener).addTo(layer)
		const $rowGroup=$table.createTBody()
		$rowGroup.id=`note-${note.id}`
		$rowGroup.classList.add(getStatusClass(note.status))
		$rowGroup.dataset.layerId=String(layer.getLayerId(marker))
		$rowGroup.addEventListener('mouseover',noteMouseoverListener)
		$rowGroup.addEventListener('mouseout',noteMouseoutListener)
		$rowGroup.addEventListener('click',noteClickListener)
		let $row=$rowGroup.insertRow()
		const nComments=note.comments.length
		{
			const $cell=$row.insertCell()
			if (nComments>1) $cell.rowSpan=nComments
			const $checkbox=document.createElement('input')
			$checkbox.type='checkbox'
			$cell.append($checkbox)
		}
		{
			const $cell=$row.insertCell()
			if (nComments>1) $cell.rowSpan=nComments
			const $a=document.createElement('a')
			$a.href=`https://www.openstreetmap.org/note/`+encodeURIComponent(note.id)
			$a.textContent=`${note.id}`
			$cell.append($a)
		}
		let firstCommentRow=true
		for (const comment of note.comments) {
			{
				if (firstCommentRow) {
					firstCommentRow=false
				} else {
					$row=$rowGroup.insertRow()
				}
			}{
				const $cell=$row.insertCell()
				const match=comment.date.match(/^(....)(..)(..)(..)(..)(..)/)
				if (match) {
					const [,Y,M,D,h,m,s]=match
					const date=`${Y}-${M}-${D}`
					const time=`${h}:${m}:${s}`
					const $dateTime=document.createElement('time')
					$dateTime.textContent=date
					$dateTime.dateTime=`${date} ${time}Z`
					$dateTime.title=`${date} ${time} UTC`
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
				$icon.classList.add('icon',getActionClass(comment.action))
				$cell.append($icon)
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
	function deactivateAllNotes(): void {
		for (const $noteRows of $table.querySelectorAll<HTMLElement>('tbody.active')) {
			deactivateNote($noteRows)
		}
	}
	function deactivateNote($noteRows: HTMLElement): void {
		currentLayerId=undefined
		$noteRows.classList.remove('active')
		const layerId=Number($noteRows.dataset.layerId)
		const marker=layer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		marker.setZIndexOffset(0)
		marker.setOpacity(0.5)
	}
	function activateNote($noteRows: HTMLElement): void {
		const layerId=Number($noteRows.dataset.layerId)
		const marker=layer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		marker.setOpacity(1)
		marker.setZIndexOffset(1000)
		$noteRows.classList.add('active')
	}
	function markerClickListener(this: NoteMarker): void {
		deactivateAllNotes()
		const $noteRows=document.getElementById(`note-`+this.noteId)
		if (!$noteRows) return
		$noteRows.scrollIntoView()
		activateNote($noteRows)
	}
	function noteMouseoverListener(this: HTMLElement): void {
		deactivateAllNotes()
		activateNote(this)
	}
	function noteMouseoutListener(this: HTMLElement): void {
		deactivateNote(this)
	}
	function noteClickListener(this: HTMLElement): void {
		const layerId=Number(this.dataset.layerId)
		const marker=layer.getLayer(layerId)
		if (!(marker instanceof L.Marker)) return
		if (layerId==currentLayerId) {
			const nextZoom=Math.min(map.getZoom()+1,map.getMaxZoom())
			map.flyTo(marker.getLatLng(),nextZoom)
		} else {
			currentLayerId=layerId
			map.panTo(marker.getLatLng())
		}
	}
	function getStatusClass(status: Note['status']): string {
		if (status=='open') {
			return 'open'
		} else if (status=='closed' || status=='hidden') {
			return 'closed'
		} else {
			return 'other'
		}
	}
	function getActionClass(action: NoteComment['action']): string {
		if (action=='opened' || action=='reopened') {
			return 'open'
		} else if (action=='closed' || action=='hidden') {
			return 'closed'
		} else {
			return 'other'
		}
	}
}

function installMap($container: HTMLElement): L.Map {
	return L.map($container).addLayer(L.tileLayer(
		'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
		{
			attribution: "© <a href=https://www.openstreetmap.org/copyright>OpenStreetMap contributors</a>",
			maxZoom: 19
		}
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
