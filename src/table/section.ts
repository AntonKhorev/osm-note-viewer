import type {Note, NoteComment, Users} from '../data'
import type {WebProvider} from '../net'
import type CommentWriter from '../comment-writer'
import {makeDateOutput} from '../comment-writer'
import {toReadableDate} from '../query-date'
import {makeDiv, makeElement} from '../util/html'
import {a,mark} from '../util/html-shortcuts'

export function writeHeadSectionRow(
	$section: HTMLTableSectionElement,
	$checkbox: HTMLInputElement,
	makeExpanderButton: (key:string,clickListener?:(value:number)=>void)=>HTMLButtonElement|undefined,
	getNoteSections: ()=>Iterable<HTMLTableSectionElement>,
	rowVisibilityChangeCallback: ()=>void
) {
	const makeExpanderCell=(cssClass:string,title:string,key:string,clickListener?:(value:number)=>void)=>{
		const $th=makeElement('th')(cssClass)()
		const $button=makeExpanderButton(key,clickListener)
		if ($button) $th.append($button)
		if (title && $button) $th.append(` `)
		if (title) $th.append(makeElement('span')('title')(title))
		return $th
	}
	const $row=$section.insertRow()
	$row.append(
		makeElement('th')('note-checkbox')(
			$checkbox
		),
		makeExpanderCell('note-link',`id`,'id'),
		makeExpanderCell('note-action',``,'comments',(value)=>{
			for (const $noteSection of getNoteSections()) {
				hideNoteSectionRows($noteSection,value<=0)
			}
			rowVisibilityChangeCallback()
		}),
		makeExpanderCell('note-date',`date`,'date'),
		makeExpanderCell('note-user',`user`,'username'),
		makeExpanderCell('note-comment',`comment`,'comment-lines'),
		makeExpanderCell('note-map',``,'map-link')
	)
}

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
	markText: string|undefined,
	mapLinkClickListener: ()=>void,
	rowVisibilityChangeCallback: ()=>void
): HTMLTableCellElement[] {
	const $commentCells: HTMLTableCellElement[]=[]
	let $row=$noteSection.insertRow()
	const nComments=note.comments.length
	const makeRowSpannedCell=(className:string)=>{
		const $cell=$row.insertCell()
		$cell.classList.add(className)
		if (nComments>1) $cell.rowSpan=nComments
		return $cell
	}
	{
		const $cell=makeRowSpannedCell('note-checkbox')
		$cell.append($checkbox)
	}{
		const $cell=makeRowSpannedCell('note-link')
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
				if (hideRows) $row.hidden=true
			}
		}{
			const $cell=$row.insertCell()
			$cell.classList.add('note-action')
			if (iComment==0) {
				const $button=makeElement('button')('icon-comments-count')()
				if (note.comments.length>1) {
					$button.innerHTML=`<svg>`+
						`<use href="#table-comments" /><text x="8" y="8"></text>`+
					`</svg>`
					updateCommentsButton($button,hideRows,note.comments.length-1)
					$button.addEventListener('click',commentsButtonClickListener)
					$button.addEventListener('click',rowVisibilityChangeCallback)
				} else {
					$button.title=`no additional comments`
				}
				$cell.append($button)
			} else {
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
				const $a=makeElement('a')()(comment.guessed?`unknown`:`anonymous`)
				$a.tabIndex=0
				$cell.append($a)
			}
		}{
			const $cell=$row.insertCell()
			$cell.classList.add('note-comment')
			$cell.tabIndex=0
			commentWriter.writeComment($cell,comment.text,showImages,markText)
			$commentCells.push($cell)
		}
		if (iComment==0) {
			const $cell=makeRowSpannedCell('note-map')
			const $a=a()
			$a.href=web.getNoteLocationUrl(note.lat,note.lon)
			$a.title=`show note on map`
			$a.innerHTML=`<svg><use href="#tools-map" /></svg>`
			$a.onclick=ev=>{
				mapLinkClickListener()
				ev.stopPropagation()
				ev.preventDefault()
			}
			$cell.append($a)
		}
		iComment++
	}
	return $commentCells
}

function hideNoteSectionRows(
	$noteSection: HTMLTableSectionElement,
	hideRows: boolean
): void {
	const $button=$noteSection.querySelector('td.note-action button')
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
	const $text=$button.querySelector('text')
	if (!$text) return
	if (hiddenRows) {
		$button.title=`show ${nAdditionalComments} following comment${s}/action${s}`
		$text.textContent=String(nAdditionalComments)
	} else {
		$button.title=`hide ${nAdditionalComments} following comment${s}/action${s}`
		$text.textContent=`−`
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

export function getNoteSectionCheckbox($noteSection: HTMLTableSectionElement): HTMLInputElement|null {
	const $checkbox=$noteSection.querySelector('.note-checkbox input')
	return $checkbox instanceof HTMLInputElement ? $checkbox : null
}

export function isSelectedNoteSection($noteSection: HTMLTableSectionElement): boolean {
	return getNoteSectionCheckbox($noteSection)?.checked ?? false
}
