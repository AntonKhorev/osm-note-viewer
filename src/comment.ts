import {escapeRegex, makeEscapeTag} from './util'

interface BaseCommentItem {
	text: string
}

interface TextCommentItem extends BaseCommentItem {
	type: 'text'
}

interface ImageCommentItem extends BaseCommentItem {
	type: 'image'
	href: string
}

interface LinkCommentItem extends BaseCommentItem {
	type: 'link'
	href: string
}

interface NoteCommentItem extends BaseCommentItem {
	type: 'note'
	id: number
}

type CommentItem = TextCommentItem | ImageCommentItem | LinkCommentItem | NoteCommentItem

export default function getCommentItems(commentText: string): CommentItem[] {
	const e=makeEscapeTag(escapeRegex)
	const result: CommentItem[] = []
	const sep='https://'
	let first=true
	for (const part of commentText.split(sep)) {
		if (first) {
			first=false
			pushText(part)
			continue
		}
		let match: RegExpMatchArray | null = null
		if (match=part.match(new RegExp(e`^(${'westnordost.de/p/'}[0-9]+${'.jpg'})(.*)$`,'s'))) {
			const [,hrefPart,rest]=match
			const href=sep+hrefPart
			result.push({
				type: 'image',
				text: href,
				href
			})
			pushText(rest)
		} else if (match=part.match(new RegExp(e`^(${'osm.org/'}(node|way|relation)${'/'}([0-9]+))(.*)$`,'s'))) {
			const [,originalHrefPart,osmType,osmId,rest]=match
			result.push({
				type: 'link',
				text: sep+originalHrefPart,
				href: `https://www.openstreetmap.org/${osmType}/${osmId}`
			})
			pushText(rest)
		} else if (match=part.match(new RegExp(e`^(${'www.openstreetmap.org/note/'}([0-9]+))(.*)$`,'s'))) {
			const [,originalHrefPart,osmId,rest]=match
			result.push({
				type: 'note',
				text: sep+originalHrefPart,
				id: Number(osmId)
			})
			pushText(rest)
		} else {
			pushText(sep+part)
		}
	}
	return result
	function pushText(text: string) {
		if (text=='') return
		result.push({
			type: 'text',
			text
		})
	}
}
