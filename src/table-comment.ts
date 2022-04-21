import getCommentItems from './comment'
import {makeLink} from './util'

export default class NoteTableCommentWriter {
	wrappedNoteLinkClickListener: (this: HTMLAnchorElement, ev: MouseEvent)=>void
	constructor(pingNoteSection: ($noteSection: HTMLTableSectionElement)=>void) {
		this.wrappedNoteLinkClickListener=function(this: HTMLAnchorElement, ev: MouseEvent){
			ev.preventDefault()
			ev.stopPropagation()
			const $noteSection=document.getElementById(`note-`+this.dataset.noteId)
			if (!($noteSection instanceof HTMLTableSectionElement)) return
			if ($noteSection.classList.contains('hidden')) return
			pingNoteSection($noteSection)
		}
	}
	writeCommentText($cell: HTMLElement, commentText: string, showImages: boolean): void {
		const result: Array<string|HTMLElement> = []
		const images: Array<HTMLAnchorElement> = []
		let iImage=0
		for (const item of getCommentItems(commentText)) {
			if (item.type=='link' && item.link=='image') {
				const $inlineLink=makeLink(item.href,item.href)
				$inlineLink.classList.add('image','inline')
				result.push($inlineLink)
				const $img=document.createElement('img')
				$img.loading='lazy' // this + display:none is not enough to surely stop the browser from accessing the image link
				if (showImages) $img.src=item.href // therefore only set the link if user agreed to loading
				$img.alt=`attached photo`
				$img.addEventListener('error',imageErrorHandler)
				const $floatLink=document.createElement('a')
				$floatLink.classList.add('image','float')
				$floatLink.href=item.href
				$floatLink.append($img)
				images.push($floatLink)
				if (!iImage) {
					$cell.addEventListener('mouseover',imageCommentHoverListener)
					$cell.addEventListener('mouseout',imageCommentHoverListener)
				}
				iImage++
			} else if (item.type=='link' && item.link=='osm' && item.osm=='note') {
				const $a=makeLink(item.text,item.href)
				$a.classList.add('other-note')
				$a.dataset.noteId=String(item.id)
				// updateNoteLink($a) // handleNotesUpdate() is going to be run anyway
				$a.addEventListener('click',this.wrappedNoteLinkClickListener)
				result.push($a)
			} else if (item.type=='link') {
				// TODO zoom map
				// TODO render element
				result.push(makeLink(item.text,item.href))
			} else {
				result.push(item.text)
			}
		}
		$cell.append(...images,...result)
	}
	handleShowImagesUpdate($table: HTMLTableElement, showImages: boolean): void {
		for (const $a of $table.querySelectorAll('td.note-comment a.image.float')) {
			if (!($a instanceof HTMLAnchorElement)) continue
			const $img=$a.firstChild
			if (!($img instanceof HTMLImageElement)) continue
			if (showImages && !$img.src) $img.src=$a.href // don't remove src when showImages is disabled, otherwise will reload all images when src is set back
		}
	}
	handleNotesUpdate($table: HTMLTableElement): void {
		for (const $a of $table.querySelectorAll('td.note-comment a.other-note')) {
			if (!($a instanceof HTMLAnchorElement)) continue
			updateNoteLink($a)
		}
	}
}

function updateNoteLink($a: HTMLAnchorElement): void {
	const $noteSection=document.getElementById(`note-`+$a.dataset.noteId)
	if (!($noteSection instanceof HTMLTableSectionElement)) {
		$a.classList.add('absent')
		$a.title=`The note is not downloaded`
	} else if ($noteSection.classList.contains('hidden')) {
		$a.classList.add('absent')
		$a.title=`The note is filtered out`
	} else {
		$a.classList.remove('absent')
		$a.title=''
	}
}

function imageCommentHoverListener(this: HTMLElement, ev: MouseEvent): void {
	const $targetLink=getTargetLink()
	if (!$targetLink) return
	const $floats=this.querySelectorAll('a.image.float')
	const $inlines=this.querySelectorAll('a.image.inline')
	for (let i=0;i<$floats.length&&i<$inlines.length;i++) {
		if ($floats[i]==$targetLink) {
			modifyTwinLink($inlines[i])
			return
		}
		if ($inlines[i]==$targetLink) {
			modifyTwinLink($floats[i])
			return
		}
	}
	function getTargetLink() {
		if (ev.target instanceof HTMLAnchorElement) return ev.target
		if (!(ev.target instanceof HTMLElement)) return null
		return ev.target.closest('a')
	}
	function modifyTwinLink($a: Element) {
		$a.classList.toggle('active',ev.type=='mouseover')
	}
}

function imageErrorHandler(this: HTMLImageElement) {
	this.removeAttribute('alt') // render broken image icon
}
