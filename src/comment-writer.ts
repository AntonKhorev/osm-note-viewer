import type {WebUrlLister} from './net'
import getCommentItems from './comment'
import makeProgressiveDate from './progressive-date'
import {convertDateToIsoString} from './util/date'
import {makeElement} from './util/html'
import {a,mark} from './util/html-shortcuts'

const defaultImageUrls=[
	`https://westnordost.de/p/`
]

export default class CommentWriter {
	private readonly imageSourceUrls: string[]
	constructor(
		private webUrlLister: WebUrlLister,
		imageSourceUrlsInput: string|null
	) {
		if (imageSourceUrlsInput==null) {
			this.imageSourceUrls=defaultImageUrls
		} else {
			this.imageSourceUrls=imageSourceUrlsInput.split('\n').map(s=>s.trim()).filter(s=>s)
		}
	}
	makeCommentElements(
		commentText: string, showImages=false, markText?: string|undefined
	): [
		inlineElements: Array<string|HTMLElement>,
		imageElements: Array<HTMLAnchorElement>
	] {
		const inlineElements: Array<string|HTMLElement> = []
		const imageElements: Array<HTMLAnchorElement> = []
		for (const item of getCommentItems(this.webUrlLister,this.imageSourceUrls,commentText)) {
			const markedText=makeMarkedText(item.text,markText)
			if (item.type=='link' && item.link=='image') {
				const $inlineLink=a(...markedText)
				$inlineLink.href=item.href
				$inlineLink.classList.add('listened','image','inline')
				inlineElements.push($inlineLink)
				const $img=document.createElement('img')
				$img.loading='lazy' // this + display:none is not enough to surely stop the browser from accessing the image link
				if (showImages) $img.src=item.href // therefore only set the link if user agreed to loading
				$img.alt=`attached photo`
				$img.addEventListener('error',imageErrorHandler)
				const $floatLink=a($img)
				$floatLink.classList.add('listened','image','float')
				$floatLink.href=item.href
				imageElements.push($floatLink)
			} else if (item.type=='link' && item.link=='osm') {
				const $a=a(...markedText)
				$a.href=item.href
				if (item.map) [$a.dataset.zoom,$a.dataset.lat,$a.dataset.lon]=item.map
				if (item.osm=='element') {
					$a.dataset.elementType=item.element
					$a.dataset.elementId=String(item.id)
				}
				if (item.osm=='changeset') {
					$a.classList.add('changeset')
					$a.dataset.changesetId=String(item.id)
				}
				if (item.osm=='note') {
					$a.classList.add('other-note')
					$a.dataset.noteId=String(item.id)
				}
				$a.classList.add('listened','osm')
				inlineElements.push($a)
			} else if (item.type=='date') {
				const $time=makeActiveTimeElement(markedText,item.text)
				inlineElements.push($time)
			} else {
				inlineElements.push(...markedText)
			}
		}
		return [inlineElements,imageElements]
	}
	writeComment(
		$cell: HTMLElement,
		commentText: string, showImages: boolean, markText: string|undefined
	): void {
		const [inlineElements,imageElements]=this.makeCommentElements(commentText,showImages,markText)
		if (imageElements.length>0) {
			$cell.addEventListener('mouseover',imageCommentHoverListener)
			$cell.addEventListener('mouseout',imageCommentHoverListener)
		}
		$cell.append(...imageElements,...inlineElements)
	}
}

export function handleShowImagesUpdate($table: HTMLTableElement, showImages: boolean): void {
	for (const $a of $table.querySelectorAll('td.note-comment a.image.float')) {
		if (!($a instanceof HTMLAnchorElement)) continue
		const $img=$a.firstChild
		if (!($img instanceof HTMLImageElement)) continue
		if (showImages && !$img.src) $img.src=$a.href // don't remove src when showImages is disabled, otherwise will reload all images when src is set back
	}
}

export function makeDateOutput(date: Date, now: Date): HTMLElement {
	const progressiveDate=makeProgressiveDate(date,now)
	const dateParts=progressiveDate.map(([text,level])=>{
		if (level==0) return text
		return makeElement('span')('date-level-'+level)(text)
	})
	return makeActiveTimeElement(
		dateParts,
		convertDateToIsoString(date),
		convertDateToIsoString(date,'-',':',' ',' UTC')
	)
}

function makeActiveTimeElement(textParts: Array<string|HTMLElement>, dateTime: string, title?: string): HTMLTimeElement {
	const $time=makeElement('time')('listened')(...textParts)
	$time.tabIndex=0
	$time.dateTime=dateTime
	if (title) $time.title=title
	return $time
}

function makeMarkedText(text: string, markText: string|undefined): (string|HTMLElement)[] {
	if (!markText) return [text]
	const result: (string|HTMLElement)[] = []
	let first=true
	for (const fragment of text.split(markText)) {
		if (first) {
			first=false
		} else {
			result.push(mark(markText))
		}
		if (fragment) result.push(fragment)
	}
	return result
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
