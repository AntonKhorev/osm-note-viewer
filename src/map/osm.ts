import type Server from '../server'
import type {
	OsmBase, OsmChangeset, OsmElement, OsmElementMap,
	OsmNodeElement, OsmWayElement, OsmRelationElement,
	OsmAdiff, OsmAdiffAction, OsmAdiffNodeElement, OsmAdiffWayElement
} from '../osm'
import {hasBbox} from '../osm'
import {makeLink, makeElement} from '../html'
import {p,strong} from '../html-shortcuts'
import {makeEscapeTag} from '../escape'

const e=makeEscapeTag(encodeURIComponent)

export interface GeometryData {
	baseGeometry?: L.Layer
	createdGeometry?: L.Layer
	modifiedGeometry?: L.Layer
	deletedGeometry?: L.Layer
	skippedRelationIds?: Set<number>
}

class GroupedGeometryData implements GeometryData {
	baseGeometry?: L.FeatureGroup
	createdGeometry?: L.FeatureGroup
	modifiedGeometry?: L.FeatureGroup
	deletedGeometry?: L.FeatureGroup
	skippedRelationIds?: Set<number>
	include(that: GeometryData) {
		this.addBaseGeometry(that.baseGeometry)
		this.addCreatedGeometry(that.createdGeometry)
		this.addModifiedGeometry(that.modifiedGeometry)
		this.addDeletedGeometry(that.deletedGeometry)
		if (that.skippedRelationIds) {
			if (!this.skippedRelationIds) {
				this.skippedRelationIds=that.skippedRelationIds
			} else {
				this.skippedRelationIds=new Set([...this.skippedRelationIds,...that.skippedRelationIds])
			}
		}
	}
	addSkippedRelationId(id: number) {
		if (!this.skippedRelationIds) {
			this.skippedRelationIds=new Set([id])
		} else {
			this.skippedRelationIds.add(id)
		}
	}
	addAdiffGeometry(actionType: 'create'|'modify'|'delete', geometry: L.Layer) {
		if (actionType=='create') {
			this.addCreatedGeometry(geometry)
		} else if (actionType=='modify') {
			this.addModifiedGeometry(geometry)
		} else if (actionType=='delete') {
			this.addDeletedGeometry(geometry)
		}
	}
	private addBaseGeometry(geometry?: L.Layer): void {
		if (!geometry) return
		if (!this.baseGeometry) this.baseGeometry=L.featureGroup()
		this.baseGeometry.addLayer(geometry)
	}
	private addCreatedGeometry(geometry?: L.Layer): void {
		if (!geometry) return
		if (!this.createdGeometry) this.createdGeometry=L.featureGroup()
		this.createdGeometry.addLayer(geometry)
	}
	private addModifiedGeometry(geometry?: L.Layer): void {
		if (!geometry) return
		if (!this.modifiedGeometry) this.modifiedGeometry=L.featureGroup()
		this.modifiedGeometry.addLayer(geometry)
	}
	private addDeletedGeometry(geometry?: L.Layer): void {
		if (!geometry) return
		if (!this.deletedGeometry) this.deletedGeometry=L.featureGroup()
		this.deletedGeometry.addLayer(geometry)
	}
}

export function renderOsmElement(
	server: Server, element: OsmElement, elements: OsmElementMap
): [
	geometryData: GeometryData, popupContents: HTMLElement[]
] {
	if (element.type=='node') {
		return makeRenderReturnValues(server,
			makeOsmNodeGeometry(element),
			makeOsmElementPopupContents(server,element)
		)
	} else if (element.type=='way') {
		return makeRenderReturnValues(server,
			makeOsmWayGeometry(element,elements),
			makeOsmElementPopupContents(server,element)
		)
	} else if (element.type=='relation') {
		return makeRenderReturnValues(server,
			makeOsmRelationGeometry(element,elements),
			makeOsmElementPopupContents(server,element),
			`the relation has no direct node/way members`
		)
	} else {
		throw new TypeError(`OSM API error: requested element has unknown type`) // shouldn't happen
	}
}

export function renderOsmChangeset(
	server: Server, changeset: OsmChangeset
): [
	geometryData: GeometryData, popupContents: HTMLElement[]
] {
	return makeRenderReturnValues(server,
		makeOsmChangesetGeometry(changeset),
		makeOsmChangesetPopupContents(server,changeset),
		`the changeset is empty`
	)
}
export function renderOsmChangesetAdiff(
	server: Server, changeset: OsmChangeset, adiff: OsmAdiff
): [
	geometryData: GeometryData, popupContents: HTMLElement[]
] {
	return makeRenderReturnValues(server,
		makeOsmChangesetAdiffGeometry(changeset,adiff),
		makeOsmChangesetAdiffPopupContents(server,changeset),
		`the changeset is empty`
	)
}

function makeRenderReturnValues(
	server: Server,
	geometryData: GeometryData,
	popupContents: HTMLElement[],
	reasonOfFakeGeometry?: string
): [
	geometryData: GeometryData, popupContents: HTMLElement[]
] {
	if (geometryData.skippedRelationIds?.size) {
		const type=geometryData.skippedRelationIds.size>1?`relations`:`relation`
		const $details=makeElement('details')()(
			makeElement('summary')()(`${geometryData.skippedRelationIds.size} member ${type}`),
			...[...geometryData.skippedRelationIds].flatMap((subRelationId,i)=>{
				const $a=getRelation(server,subRelationId)
				return i?[`, `,$a]:[$a]
			})
		)
		if (geometryData.skippedRelationIds.size<=7) $details.open=true
		popupContents.push($details)
	}
	if (!geometryData.baseGeometry) {
		if (reasonOfFakeGeometry) {
			popupContents.push(p(strong(`Warning`),`: displayed geometry is incorrect because ${reasonOfFakeGeometry}`))
		}
	}
	return [geometryData,popupContents]
}

// geometries

function makeOsmNodeGeometry(node: OsmNodeElement): GeometryData {
	return {
		baseGeometry: L.circleMarker([node.lat,node.lon])
	}
}
function makeOsmWayGeometry(way: OsmWayElement, elements: OsmElementMap): GeometryData {
	const coords: L.LatLngExpression[] = []
	for (const id of way.nodes) {
		const node=elements.node[id]
		if (!node) throw new TypeError(`OSM API error: referenced element not found in response data`)
		coords.push([node.lat,node.lon])
	}
	return {
		baseGeometry: L.polyline(coords)
	}
}
function makeOsmRelationGeometry(relation: OsmRelationElement, elements: OsmElementMap): GeometryData {
	const geometryData=new GroupedGeometryData()
	for (const member of relation.members) {
		if (member.type=='node') {
			const node=elements.node[member.ref]
			if (!node) throw new TypeError(`OSM API error: referenced element not found in response data`)
			geometryData.include(makeOsmNodeGeometry(node))
		} else if (member.type=='way') {
			const way=elements.way[member.ref]
			if (!way) throw new TypeError(`OSM API error: referenced element not found in response data`)
			geometryData.include(makeOsmWayGeometry(way,elements))
		} else if (member.type=='relation') {
			geometryData.addSkippedRelationId(member.ref)
		}
	}
	return geometryData
}

function makeOsmChangesetGeometry(changeset: OsmChangeset): GeometryData {
	if (!hasBbox(changeset)) return {}
	return {
		baseGeometry:  L.rectangle([
			[changeset.minlat,changeset.minlon],
			[changeset.maxlat,changeset.maxlon]
		],{color:'#000'})
	}
}

function makeOsmChangesetAdiffGeometry(changeset: OsmChangeset, adiff: OsmAdiff): GeometryData {
	const colorAdded='#39dbc0' // color values from OSMCha
	const colorModifiedOld='#db950a'
	const colorModifiedNew='#e8e845'
	const colorDeleted='#cc2c47'
	const geometryData=new GroupedGeometryData()
	const addOsmElementGeometry=<T>(
		adiffElement: OsmAdiffAction<T>,
		geometryAdder: (geometryData: GroupedGeometryData, actionType: 'create'|'modify'|'delete', color: string, element: T)=>void
	)=>{
		if (adiffElement.action=='create') {
			geometryAdder(geometryData,adiffElement.action,colorAdded,adiffElement.newElement)
		} else if (adiffElement.action=='modify') {
			geometryAdder(geometryData,adiffElement.action,colorModifiedOld,adiffElement.oldElement)
			geometryAdder(geometryData,adiffElement.action,colorModifiedNew,adiffElement.newElement)
		} else if (adiffElement.action=='delete') {
			geometryAdder(geometryData,adiffElement.action,colorDeleted,adiffElement.oldElement)
		}
	}
	geometryData.include(makeOsmChangesetGeometry(changeset))
	for (const adiffElement of Object.values(adiff.way)) {
		addOsmElementGeometry(adiffElement,addOsmAdiffWayGeometry)
	}
	for (const adiffElement of Object.values(adiff.node)) {
		addOsmElementGeometry(adiffElement,addOsmAdiffNodeGeometry)
	}
	return geometryData
}
function addOsmAdiffNodeGeometry(
	geometryData: GroupedGeometryData, actionType: 'create'|'modify'|'delete', color: string, node: OsmAdiffNodeElement
): void {
	geometryData.addAdiffGeometry(
		actionType,
		L.circleMarker(
			[node.lat,node.lon],
			{radius:3,color,opacity:.2,fillOpacity:1}
		)
	)
}
function addOsmAdiffWayGeometry(
	geometryData: GroupedGeometryData, actionType: 'create'|'modify'|'delete', color: string, way: OsmAdiffWayElement
): void {
	const coords: L.LatLngExpression[] = way.nodeRefs.map(([,lat,lon])=>[lat,lon])
	geometryData.addAdiffGeometry(
		actionType,
		L.polyline(coords,{weight:2,color})
	)
}

// popups

function makeOsmChangesetPopupContents(server: Server, changeset: OsmChangeset): HTMLElement[] {
	const contents=makeCommonOsmChangesetPopupContents(server,changeset,!!server.overpass)
	const $tags=getTags(changeset.tags,'comment')
	if ($tags) contents.push($tags)
	return contents
}

function makeOsmChangesetAdiffPopupContents(server: Server, changeset: OsmChangeset): HTMLElement[] {
	return makeCommonOsmChangesetPopupContents(server,changeset,false)
}

function makeCommonOsmChangesetPopupContents(server: Server, changeset: OsmChangeset, withAdiffLink: boolean): HTMLElement[] {
	const contents: HTMLElement[] = []
	const h=(...s: Array<string|HTMLElement>)=>p(makeElement('strong')()(...s))
	const c=(...s: Array<string|HTMLElement>)=>p(makeElement('em')()(...s))
	const changesetHref=server.web.getUrl(e`changeset/${changeset.id}`)
	const $header=h(`Changeset: `,makeLink(String(changeset.id),changesetHref))
	if (withAdiffLink) $header.append(` (`,getChangesetAdiff(server,changeset.id),`)`)
	contents.push($header)
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
	return contents
}

function makeOsmElementPopupContents(server: Server, element: OsmElement, subRelationIds?: Set<number>): HTMLElement[] {
	const h=(...s: Array<string|HTMLElement>)=>p(strong(...s))
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

function getChangesetAdiff(server: Server, changesetId: number): HTMLElement {
	const $a=getChangeset(server,changesetId)
	$a.innerText=`adiff`
	$a.dataset.adiff='true'
	return $a
}

function getRelation(server: Server, relationId: number): HTMLElement {
	const rid=String(relationId)
	const relationPath=e`relation/${rid}`
	const $a=makeLink(rid,server.web.getUrl(relationPath))
	$a.classList.add('listened')
	$a.dataset.elementType='relation'
	$a.dataset.elementId=rid
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
