import type {WebUrlLister} from './net/server'
import {escapeRegex} from './escape'

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
	map: [zoom: string, lat: string, lon: string] | undefined
}
interface OsmRootCommentItem extends OsmCommentItem {
	osm: 'root'
}
interface OsmElementCommentItem extends OsmCommentItem {
	osm: 'element'
	element: 'node'|'way'|'relation'
	id: number
}
interface OsmChangesetCommentItem extends OsmCommentItem {
	osm: 'changeset'
	id: number
}
interface OsmNoteCommentItem extends OsmCommentItem {
	osm: 'note'
	id: number
}

type CommentItem = TextCommentItem | DateCommentItem | ImageCommentItem | OsmRootCommentItem | OsmElementCommentItem | OsmChangesetCommentItem | OsmNoteCommentItem

export default function getCommentItems(webUrlLister: WebUrlLister, commentText: string): CommentItem[] {
	const matchRegExp=new RegExp(`(?<before>.*?)(?<text>`+
		`(?<date>\\d\\d\\d\\d-\\d\\d-\\d\\d[T ]\\d\\d:\\d\\d:\\d\\dZ)`+
	`|`+
		`(?<link>https?://(?:`+
			`(?<image>westnordost\.de/p/[0-9]+\.jpg)`+
		'|'+
			`(?<osm>`+makeWebUrlRegex(webUrlLister)+
				`(?<path>(?<osmType>node|way|relation|changeset|note)/(?<id>[0-9]+))?`+
				`(?<hash>#[-0-9a-zA-Z/.=&]+)?`+ // only need hash at root or at recognized path
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
		items.push(getMatchItem(webUrlLister,match.groups))
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

function makeWebUrlRegex(webUrlLister: WebUrlLister): string {
	return '(?:'+webUrlLister.urls.map(webUrl=>escapeRegex(stripProtocol(webUrl))).join('|')+')'
}

function stripProtocol(webUrl: string): string {
	return webUrl.replace(new RegExp('^[^:]*://'),'')
}

function getMatchItem(webUrlLister: WebUrlLister, groups: {[key:string]:string}): CommentItem {
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
				href: rewriteOsmHref(webUrlLister,groups.path,groups.hash),
				map: getMap(groups.hash)
			}
			if (groups.osmType && groups.id) {
				if (groups.osmType=='node' || groups.osmType=='way' || groups.osmType=='relation') {
					return {
						...osmItem,
						osm: 'element',
						element: groups.osmType,
						id: Number(groups.id)
					}
				} else if (groups.osmType=='changeset' || groups.osmType=='note') {
					return {
						...osmItem,
						osm: groups.osmType,
						id: Number(groups.id)
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

function rewriteOsmHref(webUrlLister: WebUrlLister, path: string|undefined, hash: string|undefined): string {
	let href=webUrlLister.getUrl(path??'')
	if (hash) href+=hash
	return href
}

function getMap(hash: string|undefined): OsmCommentItem['map'] {
	if (!hash) return
	const params=new URLSearchParams(hash.slice(1))
	const map=params.get('map')
	if (!map) return
	const match=map.match(new RegExp('([0-9.]+)/(-?[0-9.]+)/(-?[0-9.]+)'))
	if (!match) return
	const [,zoom,lat,lon]=match
	return [zoom,lat,lon]
}
