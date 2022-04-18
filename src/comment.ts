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

type CommentItem = TextCommentItem | ImageCommentItem | LinkCommentItem

export default function getCommentItems(commentText: string): CommentItem[] {
	const e=makeEscapeTag(escapeRegex)
	const result: CommentItem[] = []
	const sep='https://'
	let first=true
	for (const part of commentText.split(sep)) {
		if (first) {
			// TODO what if it starts with link?
			first=false
			result.push({
				type: 'text',
				text: part
			})
			continue
		}
		const match=part.match(new RegExp(e`^(${'westnordost.de/p/'}[0-9]+${'.jpg'})(.*)$`))
		if (match) {
			const [,hrefPart,rest]=match
			const href=sep+hrefPart
			result.push({
				type: 'image',
				text: href,
				href
			})
			continue
		}
		// TODO what if it ends with a link?
		result.push({
			type: 'text',
			text: sep+part
		})
	}
	return result
}
