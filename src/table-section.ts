import type {Note, NoteComment, Users} from './data'
import type {WebProvider} from './server'
import type CommentWriter from './comment-writer'
import {makeDateOutput} from './comment-writer'
import {toReadableDate} from './query-date'
import {makeDiv, makeElement} from './html'
import {mark} from './html-shortcuts'

/**
 * @returns comment cells
 */
export function writeNoteSectionRows(
	web: WebProvider, commentWriter: CommentWriter,
	$noteSection: HTMLTableSectionElement,
	$checkbox: HTMLInputElement,
	note: Note, users: Users,
	hideRows: boolean,
	showImages: boolean,
	markUser: string|number|undefined,
	markText: string|undefined
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
	}{
		const $cell=$row.insertCell()
		$cell.classList.add('note-comments-count')
		if (nComments>1) $cell.rowSpan=nComments
		const $button=makeElement('button')('icon-comments-count')()
		if (note.comments.length>1) {
			const nAdditionalComments=note.comments.length-1
			updateCommentsButton($button,hideRows,nAdditionalComments)
			$button.innerHTML=`<svg>`+
				`<use href="#table-comments" /><text x="8" y="8">${nAdditionalComments}</text>`+
			`</svg>`
			$button.addEventListener('click',commentsButtonClickListener)
		} else {
			$button.title=`no additional comments`
		}
		$cell.append($button)
	}
	let iComment=0
	for (const comment of note.comments) {
		{
			if (iComment>0) {
				$row=$noteSection.insertRow()
				if (hideRows) $row.hidden=true
			}
		}{
			const $cell=$row.insertCell()
			$cell.classList.add('note-date')
			$cell.append(makeDateOutput(toReadableDate(comment.date)))
		}{
			const $cell=$row.insertCell()
			$cell.classList.add('note-user')
			if (comment.uid!=null) {
				const makeUidText=()=>((typeof markUser == 'number' && markUser==comment.uid)
					? mark(`#${comment.uid}`)
					: `#${comment.uid}`
				)
				const username=users[comment.uid]
				if (username!=null) {
					const $a=web.makeUserLink(comment.uid,username)
					if (typeof markUser == 'string' && markUser==username) {
						$cell.append(mark($a))
					} else {
						$cell.append($a)
					}
					$cell.append(makeElement('span')('uid')(` `,makeUidText()))
				} else {
					$cell.append(makeUidText())
				}
			} else {
				const $a=makeElement('a')()(`anonymous`)
				$a.tabIndex=0
				$cell.append($a)
			}
		}{
			const $cell=$row.insertCell()
			$cell.classList.add('note-action')
			{
				const $icon=makeElement('span')('icon-status-'+getActionClass(comment.action))()
				$icon.tabIndex=0
				$icon.title=comment.action
				$icon.innerHTML=`<svg>`+
					`<use href="#table-note" />`+
				`</svg>`
				$cell.append($icon)
			}
		}{
			const $cell=$row.insertCell()
			$cell.classList.add('note-comment')
			$cell.tabIndex=0
			commentWriter.writeComment($cell,comment.text,showImages,markText)
			$commentCells.push($cell)
		}
		iComment++
	}
	return $commentCells
}

export function hideNoteSectionRows(
	$noteSection: HTMLTableSectionElement,
	hideRows: boolean
): void {
	const $button=$noteSection.querySelector('td.note-comments-count button')
	if (!($button instanceof HTMLButtonElement)) return
	hideNoteSectionRowsWithButton($noteSection,hideRows,$button)
}

function commentsButtonClickListener(this: HTMLButtonElement, ev: MouseEvent) {
	const $button=this
	const $noteSection=$button.closest('tbody')
	if (!($noteSection instanceof HTMLTableSectionElement)) return
	const [,$row2]=$noteSection.rows
	const wasHidden=$row2?.hidden??true
	hideNoteSectionRowsWithButton($noteSection,!wasHidden,$button)
	ev.stopPropagation()
}

function hideNoteSectionRowsWithButton(
	$noteSection: HTMLTableSectionElement,
	hideRows: boolean,
	$button: HTMLButtonElement
): void {
	let first=true
	for (const $row of $noteSection.rows) {
		if (first) {
			first=false
		} else {
			$row.hidden=hideRows
		}
	}
	updateCommentsButton($button,hideRows,$noteSection.rows.length-1)
}

function updateCommentsButton($button: HTMLButtonElement, hiddenRows: boolean, nAdditionalComments: number) {
	const s=nAdditionalComments>1?`s`:``
	if (hiddenRows) {
		$button.title=`show ${nAdditionalComments} comment${s}/action${s}`
	} else {
		$button.title=`hide comment${s}/action${s}`
	}
}

function getActionClass(action: NoteComment['action']): string {
	if (action=='opened' || action=='reopened') {
		return 'open'
	} else if (action=='closed') {
		return 'closed'
	} else if (action=='hidden') {
		return 'hidden'
	} else if (action=='commented') {
		return 'commented'
	} else {
		return 'other'
	}
}
