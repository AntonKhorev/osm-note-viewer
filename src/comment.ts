import {escapeRegex, makeEscapeTag} from './util'

interface BaseCommentItem {
	text: string
}
interface TextCommentItem extends BaseCommentItem {
	type: 'text'
}
interface DateCommentItem extends BaseCommentItem {
	type: 'date'
}
interface LinkCommentItem extends BaseCommentItem {
	type: 'link'
	href: string
}
interface ImageCommentItem extends LinkCommentItem {
	link: 'image'
}
interface OsmCommentItem extends LinkCommentItem {
	link: 'osm'
	map?: [zoom: number, lat: number, lon: number]
}
interface OsmElementCommentItem extends OsmCommentItem {
	osm: 'element'
}
interface OsmNoteCommentItem extends OsmCommentItem {
	osm: 'note'
	id: number
}

type CommentItem = TextCommentItem | ImageCommentItem | OsmElementCommentItem | OsmNoteCommentItem

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
				type: 'link',
				link: 'image',
				text: href,
				href
			})
			pushText(rest)
		} else if (match=part.match(new RegExp(e`^(${'osm.org/'}(node|way|relation)${'/'}([0-9]+))(.*)$`,'s'))) {
			const [,originalHrefPart,osmType,osmId,rest]=match
			result.push({
				type: 'link',
				link: 'osm',
				osm: 'element',
				text: sep+originalHrefPart,
				href: `https://www.openstreetmap.org/${osmType}/${osmId}`
			})
			pushText(rest)
		} else if (match=part.match(new RegExp(e`^(${'www.openstreetmap.org/note/'}([0-9]+))(.*)$`,'s'))) {
			const [,hrefPart,osmId,rest]=match
			const href=sep+hrefPart
			result.push({
				type: 'link',
				link: 'osm',
				osm: 'note',
				text: href,
				href,
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
