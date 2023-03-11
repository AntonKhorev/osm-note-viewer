import type Server from '../server'
import type {
	OsmBase, OsmChangeset, OsmElement, OsmElementMap,
	OsmNodeElement, OsmWayElement, OsmRelationElement
} from '../osm'
import {makeLink, makeElement} from '../html'
import {makeEscapeTag} from '../escape'

const e=makeEscapeTag(encodeURIComponent)

export function renderOsmChangeset(
	server: Server, changeset: OsmChangeset
): [
	geometry: L.Layer, popupContents: HTMLElement[]
] {
	return [
		makeOsmChangesetGeometry(changeset),
		makeOsmChangesetPopupContents(server,changeset)
	]
}

export function renderOsmElement(
	server: Server, element: OsmElement, elements: OsmElementMap
): [
	geometry: L.Layer, popupContents: HTMLElement[]
] {
	if (element.type=='node') {
		return [
			makeOsmNodeGeometry(element),
			makeOsmElementPopupContents(server,element)
		]
	} else if (element.type=='way') {
		return [
			makeOsmWayGeometry(element,elements),
			makeOsmElementPopupContents(server,element)
		]
	} else if (element.type=='relation') {
		return [
			makeOsmRelationGeometry(element,elements),
			makeOsmElementPopupContents(server,element)
		]
	} else {
		throw new TypeError(`OSM API error: requested element has unknown type`) // shouldn't happen
	}
}

// geometries

function makeOsmChangesetGeometry(changeset: OsmChangeset): L.Layer {
	if (
		changeset.minlat==null || changeset.minlon==null ||
		changeset.maxlat==null || changeset.maxlon==null
	) {
		throw new TypeError(`changeset is empty`)
	}
	return L.rectangle([
		[changeset.minlat,changeset.minlon],
		[changeset.maxlat,changeset.maxlon]
	])
}

function makeOsmNodeGeometry(node: OsmNodeElement): L.Layer {
	return L.circleMarker([node.lat,node.lon])
}
function makeOsmWayGeometry(way: OsmWayElement, elements: OsmElementMap): L.Layer {
	const coords: L.LatLngExpression[] = []
	for (const id of way.nodes) {
		const node=elements.node[id]
		if (!node) throw new TypeError(`OSM API error: referenced element not found in response data`)
		coords.push([node.lat,node.lon])
	}
	return L.polyline(coords)
}
function makeOsmRelationGeometry(relation: OsmRelationElement, elements: OsmElementMap): L.Layer {
	const geometry=L.featureGroup()
	for (const member of relation.members) {
		if (member.type=='node') {
			const node=elements.node[member.ref]
			if (!node) throw new TypeError(`OSM API error: referenced element not found in response data`)
			geometry.addLayer(makeOsmNodeGeometry(node))
		} else if (member.type=='way') {
			const way=elements.way[member.ref]
			if (!way) throw new TypeError(`OSM API error: referenced element not found in response data`)
			geometry.addLayer(makeOsmWayGeometry(way,elements))
		}
		// TODO indicate that there might be relations, their data may be incomplete
	}
	return geometry
}

// popups

function makeOsmChangesetPopupContents(server: Server, changeset: OsmChangeset): HTMLElement[] {
	const contents: HTMLElement[] = []
	const p=(...s: Array<string|HTMLElement>)=>makeElement('p')()(...s)
	const h=(...s: Array<string|HTMLElement>)=>p(makeElement('strong')()(...s))
	const c=(...s: Array<string|HTMLElement>)=>p(makeElement('em')()(...s))
	const changesetHref=server.web.getUrl(e`changeset/${changeset.id}`)
	contents.push(
		h(`Changeset: `,makeLink(String(changeset.id),changesetHref))
	)
	if (changeset.tags?.comment) contents.push(
		c(changeset.tags.comment)
	)
	const $p=p()
	if (changeset.closed_at) {$p.append(
		`Closed on `,getDate(changeset.closed_at)
	)} else {$p.append(
		`Created on `,getDate(changeset.created_at)
	)}
	$p.append(
		` by `,getUser(server,changeset)
	)
	contents.push($p)
	const $tags=getTags(changeset.tags,'comment')
	if ($tags) contents.push($tags)
	return contents
}

function makeOsmElementPopupContents(server: Server, element: OsmElement): HTMLElement[] {
	const p=(...s: Array<string|HTMLElement>)=>makeElement('p')()(...s)
	const h=(...s: Array<string|HTMLElement>)=>p(makeElement('strong')()(...s))
	const elementPath=e`${element.type}/${element.id}`
	const contents: HTMLElement[] = [
		h(capitalize(element.type)+`: `,makeLink(getElementName(element),server.web.getUrl(elementPath))),
		h(
			`Version #${element.version} · `,
			makeLink(`View History`,server.web.getUrl(elementPath+'/history')),` · `,
			makeLink(`Edit`,server.web.getUrl(e`edit?${element.type}=${element.id}`))
		),
		p(
			`Edited on `,getDate(element.timestamp),
			` by `,getUser(server,element),
			` · Changeset #`,getChangeset(server,element.changeset)
		)
	]
	const $tags=getTags(element.tags)
	if ($tags) contents.push($tags)
	return contents
}

// utils

function capitalize(s: string): string {
	return s[0].toUpperCase()+s.slice(1)
}

function getDate(timestamp: string): HTMLElement {
	const readableDate=timestamp.replace('T',' ').replace('Z','')
	const $time=document.createElement('time')
	$time.classList.add('listened')
	$time.textContent=readableDate
	$time.dateTime=timestamp
	return $time
}

function getUser(server: Server, data: OsmBase): HTMLElement {
	const $a=makeUserLink(server,data.uid,data.user)
	$a.classList.add('listened')
	$a.dataset.userName=data.user
	$a.dataset.userId=String(data.uid)
	return $a
}

function getChangeset(server: Server, changesetId: number): HTMLElement {
	const cid=String(changesetId)
	const $a=makeLink(cid,server.web.getUrl(e`changeset/${cid}`))
	$a.classList.add('listened')
	$a.dataset.changesetId=cid
	return $a
}

function getTags(tags: {[key:string]:string}|undefined, skipKey?: string): HTMLElement|null {
	if (!tags) return null
	const tagBatchSize=10
	const tagList=Object.entries(tags).filter(([k,v])=>k!=skipKey)
	if (tagList.length<=0) return null
	let i=0
	let $button: HTMLButtonElement|undefined
	const $figure=document.createElement('figure')
	const $figcaption=document.createElement('figcaption')
	$figcaption.textContent=`Tags`
	const $table=document.createElement('table')
	$figure.append($figcaption,$table)
	writeTagBatch()
	return $figure
	function writeTagBatch() {
		for (let j=0;i<tagList.length&&j<tagBatchSize;i++,j++) {
			const [k,v]=tagList[i]
			const $row=$table.insertRow()
			const $keyCell=$row.insertCell()
			$keyCell.textContent=k
			if (k.length>30) $keyCell.classList.add('long')
			$row.insertCell().textContent=v
		}
		if (i<tagList.length) {
			if (!$button) {
				$button=document.createElement('button')
				$figure.append($button)
				$button.onclick=writeTagBatch
			}
			const nTagsLeft=tagList.length-i
			const nTagsToShowNext=Math.min(nTagsLeft,tagBatchSize)
			$button.textContent=`Show ${nTagsToShowNext} / ${nTagsLeft} more tags`
		} else {
			$button?.remove()
		}
	}
}

function getElementName(element: OsmElement): string {
	if (element.tags?.name) {
		return `${element.tags.name} (${element.id})`
	} else {
		return String(element.id)
	}
}

function makeUserLink(server: Server, uid: number, username?: string): HTMLElement {
	if (username) return makeUserNameLink(server,username)
	return makeUserIdLink(server,uid)
}

function makeUserNameLink(server: Server, username: string): HTMLAnchorElement {
	const fromName=(name: string)=>server.web.getUrl(e`user/${name}`)
	return makeLink(username,fromName(username))
}

function makeUserIdLink(server: Server, uid: number): HTMLAnchorElement {
	const fromId=(id: number)=>server.api.getUrl(e`user/${id}`)
	return makeLink('#'+uid,fromId(uid))
}