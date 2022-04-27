import getCommentItems from './comment'
import {NoteMap} from './map'
import PhotoDialog from './photo'
import downloadAndShowElement from './osm'
import {makeLink} from './util'

export default class NoteTableCommentWriter {
	wrappedOsmLinkClickListener:  (this: HTMLAnchorElement, ev: MouseEvent)=>void
	wrappedImageLinkClickListener:  (this: HTMLAnchorElement, ev: MouseEvent)=>void
	constructor(
		private $table: HTMLTableElement, map: NoteMap, photoDialog: PhotoDialog,
		pingNoteSection: ($noteSection: HTMLTableSectionElement)=>void,
		private activeTimeElementClickListener: (this: HTMLTimeElement, ev: MouseEvent) => void
	) {
		const that=this
		this.wrappedOsmLinkClickListener=function(this: HTMLAnchorElement, ev: MouseEvent){
			const $a=this
			ev.preventDefault()
			ev.stopPropagation()
			if (handleNote($a.dataset.noteId)) return
			if (handleElement($a.dataset.elementType,$a.dataset.elementId)) return
			handleMap($a.dataset.zoom,$a.dataset.lat,$a.dataset.lon)
			function handleNote(noteId: string|undefined): boolean {
				if (!noteId) return false
				const $noteSection=document.getElementById(`note-`+noteId)
				if (!($noteSection instanceof HTMLTableSectionElement)) return false
				if ($noteSection.classList.contains('hidden')) return false
				photoDialog.close()
				pingNoteSection($noteSection)
				return true
			}
			function handleElement(elementType: string|undefined, elementId: string|undefined): boolean {
				if (!elementId) return false
				if (elementType!='node' && elementType!='way' && elementType!='relation') return false
				photoDialog.close()
				downloadAndShowElement(
					$a,map,
					(readableDate)=>makeDateOutput(readableDate,that.activeTimeElementClickListener),
					elementType,elementId
				)
				return true
			}
			function handleMap(zoom: string|undefined, lat: string|undefined, lon: string|undefined): boolean {
				if (!(zoom && lat && lon)) return false
				photoDialog.close()
				map.panAndZoomTo([Number(lat),Number(lon)],Number(zoom))
				return true
			}
		}
		this.wrappedImageLinkClickListener=function(this: HTMLAnchorElement, ev: MouseEvent){
			const $a=this
			ev.preventDefault()
			ev.stopPropagation()
			photoDialog.toggle($a.href)
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
				$inlineLink.addEventListener('click',this.wrappedImageLinkClickListener)
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
				$floatLink.addEventListener('click',this.wrappedImageLinkClickListener)
				images.push($floatLink)
				if (!iImage) {
					$cell.addEventListener('mouseover',imageCommentHoverListener)
					$cell.addEventListener('mouseout',imageCommentHoverListener)
				}
				iImage++
			} else if (item.type=='link' && item.link=='osm') {
				const $a=makeLink(item.text,item.href)
				$a.classList.add('osm')
				if (item.map) [$a.dataset.zoom,$a.dataset.lat,$a.dataset.lon]=item.map
				if (item.osm=='note') {
					$a.classList.add('other-note')
					$a.dataset.noteId=String(item.id)
					// updateNoteLink($a) // handleNotesUpdate() is going to be run anyway
				}
				if (item.osm=='element') {
					$a.dataset.elementType=item.element
					$a.dataset.elementId=String(item.id)
				}
				$a.addEventListener('click',this.wrappedOsmLinkClickListener)
				result.push($a)
			} else if (item.type=='date') {
				const $time=makeActiveTimeElement(item.text,item.text)
				$time.addEventListener('click',this.activeTimeElementClickListener)
				result.push($time)
			} else {
				result.push(item.text)
			}
		}
		$cell.append(...images,...result)
	}
	handleShowImagesUpdate(showImages: boolean): void {
		for (const $a of this.$table.querySelectorAll('td.note-comment a.image.float')) {
			if (!($a instanceof HTMLAnchorElement)) continue
			const $img=$a.firstChild
			if (!($img instanceof HTMLImageElement)) continue
			if (showImages && !$img.src) $img.src=$a.href // don't remove src when showImages is disabled, otherwise will reload all images when src is set back
		}
	}
	handleNotesUpdate(): void {
		for (const $a of this.$table.querySelectorAll('td.note-comment a.other-note')) {
			if (!($a instanceof HTMLAnchorElement)) continue
			updateNoteLink($a)
		}
	}
}

export function makeDateOutput(readableDate: string, activeTimeElementClickListener: (this: HTMLTimeElement, ev: MouseEvent) => void): HTMLElement {
	const [readableDateWithoutTime]=readableDate.split(' ',1)
	if (readableDate && readableDateWithoutTime) {
		const $time=makeActiveTimeElement(readableDateWithoutTime,`${readableDate.replace(' ','T')}Z`,`${readableDate} UTC`)
		$time.addEventListener('click',activeTimeElementClickListener)
		return $time
	} else {
		const $unknownDateTime=document.createElement('span')
		$unknownDateTime.textContent=`?`
		return $unknownDateTime
	}
}

function makeActiveTimeElement(text: string, dateTime: string, title?: string): HTMLTimeElement {
	const $time=document.createElement('time')
	$time.textContent=text
	$time.dateTime=dateTime
	if (title) $time.title=title
	return $time
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
