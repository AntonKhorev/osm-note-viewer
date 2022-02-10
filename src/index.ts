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
	const $fetchNotesButton=document.getElementById('fetch-notes')
	if (!$fetchNotesButton) return
	const $notesContainer=document.getElementById('notes-container')
	if (!$notesContainer) return
	$fetchNotesButton.addEventListener('click',async()=>{
		const url=`https://api.openstreetmap.org/api/0.6/notes/search.json?closed=-1&sort=created_at&limit=20&display_name=Anton%20Khorev`
		const response=await fetch(url)
		const data=await response.json()
		if (!isNoteFeatureCollection(data)) return
		writeNotesTable($notesContainer,data.features)
	})
}

function isNoteFeatureCollection(data: any): data is NoteFeatureCollection {
	return data.type=="FeatureCollection"
}

function writeNotesTable($container: HTMLElement, notes: NoteFeature[]): void {
	$container.innerHTML=``
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
