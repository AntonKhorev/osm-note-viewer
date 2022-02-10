main()

interface NoteFeature {
	properties: {
		id: number
	}
}

interface NoteFeatureCollection {
	type: "FeatureCollection"
	features: NoteFeature[]
}

function main(): void {
	const $fetchNotesForm=document.getElementById('fetch-notes')
	if (!($fetchNotesForm instanceof HTMLFormElement)) return
	const $notesContainer=document.getElementById('notes-container')
	if (!($notesContainer instanceof HTMLElement)) return
	const $usernameInput=document.getElementById('username')
	if (!($usernameInput instanceof HTMLInputElement)) return
	const $submitButton=document.getElementById('fetch-submit')
	if (!($submitButton instanceof HTMLButtonElement)) return
	$fetchNotesForm.addEventListener('submit',async(ev)=>{
		ev.preventDefault()
		$submitButton.disabled=true
		const username=$usernameInput.value
		$notesContainer.innerHTML=``
		writeLoading($notesContainer,username)
		const url=`https://api.openstreetmap.org/api/0.6/notes/search.json?closed=-1&sort=created_at&limit=20&display_name=${encodeURIComponent(username)}`
		try {
			const response=await fetch(url)
			if (!response.ok) {
				const responseText=await response.text()
				$notesContainer.innerHTML=``
				writeError($notesContainer,username,`received the following error response`,responseText)
			} else {
				const data=await response.json()
				if (!isNoteFeatureCollection(data)) return
				$notesContainer.innerHTML=``
				writeExtras($notesContainer,username)
				writeNotesTable($notesContainer,data.features)
			}
		} catch (ex) {
			$notesContainer.innerHTML=``
			if (ex instanceof TypeError) {
				writeError($notesContainer,username,`failed with the following error before receiving a response`,ex.message)
			} else {
				writeError($notesContainer,username,`failed for unknown reason`,`${ex}`)
			}
		}
		$submitButton.disabled=false
	})
}

function isNoteFeatureCollection(data: any): data is NoteFeatureCollection {
	return data.type=="FeatureCollection"
}

function writeLoading($container: HTMLElement, username: string): void {
	const $message=document.createElement('div')
	const $userLink=document.createElement('a')
	$userLink.href=`https://www.openstreetmap.org/user/${encodeURIComponent(username)}`
	$userLink.textContent=username
	$message.append(`Loading notes of user `,$userLink,` ...`)
	$container.append($message)
}

function writeError($container: HTMLElement, username: string, responseKindText: string, errorText: string): void {
	const $message=document.createElement('div')
	const $userLink=document.createElement('a')
	$userLink.href=`https://www.openstreetmap.org/user/${encodeURIComponent(username)}`
	$userLink.textContent=username
	$message.append(`Loading notes of user `,$userLink,` ${responseKindText}:`)
	const $error=document.createElement('pre')
	$error.textContent=errorText
	$container.append($message,$error)
}

function writeExtras($container: HTMLElement, username: string): void {
	const $details=document.createElement('details')
	const $summary=document.createElement('summary')
	$summary.textContent=`Extra links`
	const $userLink=document.createElement('a')
	$userLink.href=`https://www.openstreetmap.org/user/${encodeURIComponent(username)}`
	$userLink.textContent=`this user`
	const $jsonLink=document.createElement('a')
	$jsonLink.href=`https://api.openstreetmap.org/api/0.6/notes/search.json?closed=-1&sort=created_at&limit=10000&display_name=${encodeURIComponent(username)}`
	$jsonLink.textContent=`json`
	$details.append($summary,`Fetch up to 10000 notes of `,$userLink,` (may be slow): `,$jsonLink)
	$container.append($details)
}

function writeNotesTable($container: HTMLElement, notes: NoteFeature[]): void {
	const $table=document.createElement('table')
	$container.append($table)
	for (const note of notes) {
		const $row=$table.insertRow()
		const $cell=$row.insertCell()
		const $a=document.createElement('a')
		$a.href=`https://www.openstreetmap.org/note/`+encodeURIComponent(note.properties.id)
		$a.textContent=`${note.properties.id}`
		$cell.append($a)
	}
}
