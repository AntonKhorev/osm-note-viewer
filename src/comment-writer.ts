import type {WebUrlLister} from './server'
import getCommentItems from './comment'
import {makeElement, makeLink} from './html'

export default class CommentWriter {
	constructor(private webUrlLister: WebUrlLister) {}
	makeCommentElements(
		commentText: string, showImages=false
	): [
		inlineElements: Array<string|HTMLAnchorElement|HTMLTimeElement>,
		imageElements: Array<HTMLAnchorElement>
	] {
		const inlineElements: Array<string|HTMLAnchorElement|HTMLTimeElement> = []
		const imageElements: Array<HTMLAnchorElement> = []
		for (const item of getCommentItems(this.webUrlLister,commentText)) {
			if (item.type=='link' && item.link=='image') {
				const $inlineLink=makeLink(item.href,item.href)
				$inlineLink.classList.add('listened','image','inline')
				inlineElements.push($inlineLink)
				const $img=document.createElement('img')
				$img.loading='lazy' // this + display:none is not enough to surely stop the browser from accessing the image link
				if (showImages) $img.src=item.href // therefore only set the link if user agreed to loading
				$img.alt=`attached photo`
				$img.addEventListener('error',imageErrorHandler)
				const $floatLink=document.createElement('a')
				$floatLink.classList.add('listened','image','float')
				$floatLink.href=item.href
				$floatLink.append($img)
				imageElements.push($floatLink)
			} else if (item.type=='link' && item.link=='osm') {
				const $a=makeLink(item.text,item.href)
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
				const $time=makeActiveTimeElement(item.text,'',item.text)
				inlineElements.push($time)
			} else {
				inlineElements.push(item.text)
			}
		}
		return [inlineElements,imageElements]
	}
	writeComment($cell: HTMLElement, commentText: string, showImages: boolean): void {
		const [inlineElements,imageElements]=this.makeCommentElements(commentText,showImages)
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

export function makeDateOutput(readableDate: string): HTMLElement {
	const [readableDateWithoutTime,readableDateTime]=readableDate.split(' ',2)
	if (readableDate && readableDateWithoutTime) {
		return makeActiveTimeElement(readableDateWithoutTime,` ${readableDateTime}`,`${readableDate.replace(' ','T')}Z`,`${readableDate} UTC`)
	} else {
		const $unknownDateTime=document.createElement('span')
		$unknownDateTime.textContent=`?`
		return $unknownDateTime
	}
}

function makeActiveTimeElement(unwrappedPart: string, wrappedPart: string, dateTime: string, title?: string): HTMLTimeElement {
	const $time=makeElement('time')('listened')(unwrappedPart)
	$time.tabIndex=0
	$time.dateTime=dateTime
	if (title) $time.title=title
	if (wrappedPart) $time.append(makeElement('span')()(wrappedPart))
	return $time
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
