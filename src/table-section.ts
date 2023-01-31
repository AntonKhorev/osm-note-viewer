import type {Note, NoteComment, Users} from './data'
import type {WebProvider} from './server'
import type CommentWriter from './comment-writer'
import {makeDateOutput} from './comment-writer'
import {toReadableDate} from './query-date'
import {makeDiv, makeLink} from './html'

export default function writeNoteSectionRows(
	web: WebProvider, commentWriter: CommentWriter,
	$noteSection: HTMLTableSectionElement,
	note: Note, users: Users,
	showImages: boolean
): [$checkbox:HTMLInputElement,$commentCells:HTMLTableCellElement[]] {
	const $checkbox=document.createElement('input')
	const $commentCells:HTMLTableCellElement[]=[]
	let $row=$noteSection.insertRow()
	const nComments=note.comments.length
	{
		const $cell=$row.insertCell()
		$cell.classList.add('note-checkbox')
		if (nComments>1) $cell.rowSpan=nComments
		$checkbox.type='checkbox'
		$checkbox.title=`shift+click to select/unselect a range`
		$cell.append($checkbox)
	}{
		const $cell=$row.insertCell()
		$cell.classList.add('note-link')
		if (nComments>1) $cell.rowSpan=nComments
		const $a=document.createElement('a')
		$a.href=web.getUrl(`note/`+encodeURIComponent(note.id))
		$a.dataset.noteId=$a.textContent=`${note.id}`
		$a.dataset.self='yes'
		$a.classList.add('listened')
		$a.title=`reload the note`
		const $refreshWaitProgress=document.createElement('progress')
		$refreshWaitProgress.setAttribute('aria-hidden','true') // otherwise screen reader constantly announces changes of progress elements
		$refreshWaitProgress.value=0
		$cell.append(makeDiv()($a,$refreshWaitProgress))
	}
	let iComment=0
	for (const comment of note.comments) {
		{
			if (iComment>0) {
				$row=$noteSection.insertRow()
			}
		}{
			const $cell=$row.insertCell()
			$cell.classList.add('note-date')
			$cell.append(makeDateOutput(toReadableDate(comment.date)))
		}{
			const $cell=$row.insertCell()
			$cell.classList.add('note-user')
			if (comment.uid!=null) {
				const username=users[comment.uid]
				if (username!=null) {
					const href=web.getUrl(`user/`+encodeURIComponent(username))
					const $a=makeLink(username,href)
					$a.classList.add('listened')
					$a.dataset.userName=username
					$a.dataset.userId=String(comment.uid)
					$cell.append($a)
				} else {
					$cell.append(`#${comment.uid}`)
				}
			}
		}{
			let svgs=`<svg class="icon-status-${getActionClass(comment.action)}">`+
				`<title>${comment.action}</title><use href="#table-note" />`+
			`</svg>`
			if (note.comments.length>1) {
				const nAdditionalComments=note.comments.length-1
				const title=`${nAdditionalComments} additional comment${nAdditionalComments>1?`s`:``}`
				svgs+=` <svg class="icon-comments-count">`+
					`<title>${title}</title><use href="#table-comments" /><text x="8" y="8">${nAdditionalComments}</text>`+
				`</svg>`
			}
			const $cell=$row.insertCell()
			$cell.classList.add('note-action')
			$cell.innerHTML=svgs
		}{
			const $cell=$row.insertCell()
			$cell.classList.add('note-comment')
			commentWriter.writeComment($cell,comment.text,showImages)
			$commentCells.push($cell)
		}
		iComment++
	}
	return [$checkbox,$commentCells]
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
