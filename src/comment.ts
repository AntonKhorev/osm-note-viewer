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
				`(?<hash>#[0-9a-zA-Z/.=&]+)?`+ // only need hash at root or at recognized path
			`)`+
		`))`+
	`)`,'sy')
	const items: CommentItem[] = []
	let idx=0
	while (true) {
		idx=matchRegExp.lastIndex
		const match=matchRegExp.exec(commentText)
		if (!match || !match.groups) break
		pushTextItem(match.groups.before)
		items.push(getMatchItem(match.groups))
	}
	pushTextItem(commentText.slice(idx))
	return collapseTextItems(items)
	function pushTextItem(text: string) {
		if (text=='') return
		items.push({
			type: 'text',
			text
		})
	}
	function collapseTextItems(inputItems: CommentItem[]): CommentItem[] {
		const outputItems: CommentItem[] = []
		let tailTextItem: TextCommentItem|undefined
		for (const item of inputItems) {
			if (item.type=='text') {
				if (tailTextItem) {
					tailTextItem.text+=item.text
				} else {
					outputItems.push(item)
					tailTextItem=item
				}
			} else {
				outputItems.push(item)
				tailTextItem=undefined
			}
		}
		return outputItems
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
			} else if (osmItem.map) { // only make root links if they have map hash, otherwise they may not even be a root links
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
