import type {Note, NoteComment, Users} from './data'
import type {WebProvider} from './server'
import type CommentWriter from './comment-writer'
import {makeDateOutput} from './comment-writer'
import {toReadableDate} from './query-date'
import {makeDiv, makeElement, makeLink} from './html'

/**
 * @returns comment cells
 */
export default function writeNoteSectionRows(
	web: WebProvider, commentWriter: CommentWriter,
	$noteSection: HTMLTableSectionElement,
	$checkbox: HTMLInputElement,
	note: Note, users: Users,
	showImages: boolean
): HTMLTableCellElement[] {
	const $commentCells: HTMLTableCellElement[]=[]
	let $row=$noteSection.insertRow()
	const nComments=note.comments.length
	{
		const $cell=$row.insertCell()
		$cell.classList.add('note-checkbox')
		if (nComments>1) $cell.rowSpan=nComments
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
			} else {
				const $a=makeElement('a')()(`anonymous`)
				$a.tabIndex=0
				$cell.append($a)
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
			const $iconWrapper=makeElement('span')('icon-container')()
			$iconWrapper.tabIndex=0
			$iconWrapper.innerHTML=svgs
			const $cell=$row.insertCell()
			$cell.classList.add('note-action')
			$cell.append($iconWrapper)
		}{
			const $cell=$row.insertCell()
			$cell.classList.add('note-comment')
			$cell.tabIndex=0
			commentWriter.writeComment($cell,comment.text,showImages)
			$commentCells.push($cell)
		}
		iComment++
	}
	return $commentCells
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
