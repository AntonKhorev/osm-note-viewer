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
	map: [zoom: number, lat: number, lon: number] | undefined
}
interface OsmRootCommentItem extends OsmCommentItem {
	osm: 'root'
}
interface OsmElementCommentItem extends OsmCommentItem {
	osm: 'element'
}
interface OsmNoteCommentItem extends OsmCommentItem {
	osm: 'note'
	id: number
}

type CommentItem = TextCommentItem | DateCommentItem | ImageCommentItem | OsmRootCommentItem | OsmElementCommentItem | OsmNoteCommentItem

export default function getCommentItems(commentText: string): CommentItem[] {
	const matchRegExp=new RegExp(`(?<before>.*?)(?<text>`+
		`(?<date>\\d\\d\\d\\d-\\d\\d-\\d\\d[T ]\\d\\d:\\d\\d:\\d\\dZ)`+
	`|`+
		`(?<link>https?://(?:`+
			`(?<image>westnordost\.de/p/[0-9]+\.jpg)`+
		'|'+
			`(?<osm>(?:www\\.)?(?:osm|openstreetmap)\\.org/`+
				`(?<path>(?<type>node|way|relation|note)/(?<id>[0-9]+))?`+
				`(?<hash>#[0-9a-zA-Z/.=&]+)?`+
			`)`+
		`))`+
	`)`,'sy')
	const result: CommentItem[] = []
	let idx=0
	while (true) {
		idx=matchRegExp.lastIndex
		const match=matchRegExp.exec(commentText)
		if (!match || !match.groups) break
		pushText(match.groups.before)
		result.push(getMatchItem(match.groups))
	}
	pushText(commentText.slice(idx))
	return result
	function pushText(text: string) {
		if (text=='') return
		result.push({
			type: 'text',
			text
		})
	}
}

function getMatchItem(groups: {[key:string]:string}): CommentItem {
	const baseItem: BaseCommentItem = {
		text: groups.text
	}
	if (groups.date) {
		return {
			...baseItem,
			type: 'date',
		}
	} else if (groups.link) {
		const linkItem: LinkCommentItem = {
			...baseItem,
			type: 'link',
			href: groups.link
		}
		if (groups.image) {
			return {
				...linkItem,
				link: 'image'
			}
		} else if (groups.osm) {
			const osmItem: OsmCommentItem = {
				...linkItem,
				link: 'osm',
				href: rewriteOsmHref(groups.path,groups.hash),
				map: getMap(groups.hash)
			}
			if (groups.type && groups.id) {
				if (groups.type=='note') {
					return {
						...osmItem,
						osm: 'note',
						id: Number(groups.id)
					}
				} else {
					return {
						...osmItem,
						osm: 'element'
					}
				}
			} else {
				return {
					...osmItem,
					osm: 'root'
				}
			}
		}
	}
	return { // shouldn't happen
		...baseItem,
		type: 'text'
	}
}

function rewriteOsmHref(path: string|undefined, hash: string|undefined): string {
	let href=`https://www.openstreetmap.org/` // changes osm.org and other redirected paths to canonical
	if (path) href+=path
	if (hash) href+=hash
	return href
}

function getMap(hash: string|undefined): OsmCommentItem['map'] {
	if (!hash) return
	const params=new URLSearchParams(hash.slice(1))
	const map=params.get('map')
	if (!map) return
	const match=map.match(new RegExp('([0-9.]+)/([0-9.]+)/([0-9.]+)'))
	if (!match) return
	const [,zoom,lat,lon]=match
	return [Number(zoom),Number(lat),Number(lon)]
}
