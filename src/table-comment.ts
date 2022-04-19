import getCommentItems from './comment'
import {makeLink} from './util'

export default function makeWriteCommentText(pingNoteSection: ($noteSection: HTMLElement)=>void) {
	return function writeCommentText($cell: HTMLElement, commentText: string, showImages: boolean): void {
		const result: Array<string|HTMLElement> = []
		const images: Array<HTMLAnchorElement> = []
		let iImage=0
		for (const item of getCommentItems(commentText)) {
			if (item.type=='image') {
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
			} else if (item.type=='note') {
				const $a=makeLink(item.text,`https://www.openstreetmap.org/note/`+item.id)
				$a.classList.add('other-note')
				$a.dataset.noteId=String(item.id)
				$a.addEventListener('click',noteClickListener)
				result.push($a)
			} else if (item.type=='link') {
				result.push(makeLink(item.text,item.href))
			} else {
				result.push(item.text)
			}
		}
		$cell.append(...images,...result)
	}
	function noteClickListener(this: HTMLAnchorElement, ev: MouseEvent) {
		ev.preventDefault()
		ev.stopPropagation()
		const $noteSection=document.getElementById(`note-`+this.dataset.noteId)
		if (!($noteSection instanceof HTMLElement)) return
		if ($noteSection.classList.contains('hidden')) return
		pingNoteSection($noteSection)
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
