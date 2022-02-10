main()

interface NoteFeatureCollection {
	type: "FeatureCollection"
	features: NoteFeature[]
}

interface NoteFeature {
	properties: {
		id: number
		comments: NoteComment[]
	}
}

interface NoteComment {
	user?: string
	text: string
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
		const $userLinks=document.createElement('div')
		$userLinks.append(
			`Fetch up to 10000 notes of `,
			makeLink(`this user`,`https://www.openstreetmap.org/user/${encodeURIComponent(username)}`),
			` (may be slow): `,
			makeLink(`json`,`https://api.openstreetmap.org/api/0.6/notes/search.json?closed=-1&sort=created_at&limit=10000&display_name=${encodeURIComponent(username)}`)
		)
		$details.append($userLinks)
	}{
		const $docLinks=document.createElement('div')
		$docLinks.append(
			`Notes documentation: `,
			makeLink(`wiki`,`https://wiki.openstreetmap.org/wiki/Notes`),
			` `,
			makeLink(`api`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Map_Notes_API`)
		)
		$details.append($docLinks)
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
			makeHeaderCell('user'),
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
				$cell.classList.add('note-user')
				if (comment.user!=null) {
					$cell.append(makeUserLink(comment.user))
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

function makeUserLink(username: string): HTMLAnchorElement {
	return makeLink(username,`https://www.openstreetmap.org/user/${encodeURIComponent(username)}`)
}

function makeLink(text: string, href: string): HTMLAnchorElement {
	const $link=document.createElement('a')
	$link.href=href
	$link.textContent=text
	return $link
}
