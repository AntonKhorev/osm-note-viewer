import Server from '../server'
import type {OsmBase, OsmElementBase} from '../osm'
import type {LayerBoundOsmData} from './osm'
import {makeElement, makeDiv, makeLink} from '../html'
import {p,strong,em} from '../html-shortcuts'
import {makeEscapeTag} from '../escape'

const e=makeEscapeTag(encodeURIComponent)
const h=(...s: Array<string|HTMLElement>)=>p(strong(...s))
const c=(...s: Array<string|HTMLElement>)=>p(em(...s))

export function makePopupWriter(
	server: Server,
	layerData: LayerBoundOsmData,
	clear: ()=>void
) {
	return ()=>{
		const $popup=makeDiv('osm-element-popup-contents')()
		if (layerData.type=='changeset') {
			const changeset=layerData.item
			const headerContents: (string|HTMLElement)[] = [
				`Changeset: `,makeChangesetLink(server,changeset.id)
			]
			if (server.overpass) headerContents.push(
				` · `,makeChangesetAdiffLink(server,changeset.id)
			)
			$popup.append(h(...headerContents))
			if (changeset.tags?.comment) $popup.append(
				c(changeset.tags.comment)
			)
			const $p=p()
			if (changeset.closed_at) {$p.append(
				`Closed on `,makeDate(changeset.closed_at)
			)} else {$p.append(
				`Created on `,makeDate(changeset.created_at)
			)}
			$p.append(
				` by `,makeUserLink(server,changeset)
			)
			$popup.append($p)
			if (!layerData.adiff) {
				const $tags=makeTagsFigure(changeset.tags,'comment')
				if ($tags) $popup.append($tags)
			}
		} else if (layerData.type=='element' && !layerData.adiff) {
			const element=layerData.item
			const headerContents=makeElementHeaderContents(server,element,element.type)
			$popup.append(
				h(...headerContents),
				...makeElementContents(server,element)
			)
		} else if (layerData.type=='element' && layerData.adiff) {
			if (layerData.item.action=='create') {
				const {newElement}=layerData.item
				const headerContents=makeElementHeaderContents(server,newElement,newElement.type)
				$popup.append(
					h(...headerContents),
					...makeElementContents(server,newElement,newElement.visible,`New version`)
				)
			} else if (layerData.item.action=='modify' || layerData.item.action=='delete') {
				const {oldElement,newElement}=layerData.item
				const headerContents=makeElementHeaderContents(server,newElement,newElement.type)
				$popup.append(
					h(...headerContents),
					...makeElementContents(server,oldElement,oldElement.visible,`Old version`),
					...makeElementContents(server,newElement,newElement.visible,`New version`)
				)
			}
		}
		if (layerData.skippedRelationIds?.size) {
			const type=layerData.skippedRelationIds.size>1?`relations`:`relation`
			const $details=makeElement('details')()(
				makeElement('summary')()(`${layerData.skippedRelationIds.size} member ${type}`),
				...[...layerData.skippedRelationIds].flatMap((subRelationId,i)=>{
					const $a=makeRelationLink(server,subRelationId)
					return i?[`, `,$a]:[$a]
				})
			)
			if (layerData.skippedRelationIds.size<=7) $details.open=true
			$popup.append($details)
		}
		if (layerData.emptyReason) {
			$popup.append(p(strong(`Warning`),`: displayed geometry is incorrect because ${layerData.emptyReason}`))
		}
		{
			const $removeButton=document.createElement('button')
			$removeButton.textContent=`Remove from map view`
			$removeButton.onclick=clear
			$popup.append($removeButton)
		}
		return $popup
	}
}

function makeElementHeaderContents(server: Server, element: OsmElementBase, elementType: string): (string|HTMLElement)[] {
	const elementPath=e`${elementType}/${element.id}`
	const headerContents: (string|HTMLElement)[] = [
		capitalize(elementType)+`: `,
		makeLink(getElementName(element),server.web.getUrl(elementPath)),
		` · `,makeLink(`View History`,server.web.getUrl(elementPath+'/history')),
		` · `,makeLink(`Edit`,server.web.getUrl(e`edit?${elementType}=${element.id}`))
	]
	return headerContents
}

function makeElementContents(server: Server, element: OsmElementBase, visisble=true, versionTitle=`Version`): HTMLElement[] {
	const content: HTMLElement[] = []
	content.push(h(
		`${versionTitle} #${element.version}`,visisble?``:` · DELETED`
	),p(
		`Edited on `,makeDate(element.timestamp),
		` by `,makeUserLink(server,element),
		` · Changeset #`,makeChangesetLink(server,element.changeset)
	))
	const $tags=makeTagsFigure(element.tags)
	if ($tags) content.push($tags)
	return content
}

function makeTagsFigure(tags: {[key:string]:string}|undefined, skipKey?: string): HTMLElement|null {
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

function makeChangesetAdiffLink(server: Server, changesetId: number): HTMLElement {
	const $a=makeChangesetLink(server,changesetId)
	$a.innerText=`Adiff`
	$a.dataset.adiff='true'
	return $a
}

function makeChangesetLink(server: Server, changesetId: number): HTMLElement {
	const cid=String(changesetId)
	const $a=makeLink(cid,server.web.getUrl(e`changeset/${cid}`))
	$a.classList.add('listened')
	$a.dataset.changesetId=cid
	return $a
}

function makeRelationLink(server: Server, relationId: number): HTMLElement {
	const rid=String(relationId)
	const relationPath=e`relation/${rid}`
	const $a=makeLink(rid,server.web.getUrl(relationPath))
	$a.classList.add('listened')
	$a.dataset.elementType='relation'
	$a.dataset.elementId=rid
	return $a
}

function makeDate(timestamp: string): HTMLElement {
	const readableDate=timestamp.replace('T',' ').replace('Z','')
	const $time=document.createElement('time')
	$time.classList.add('listened')
	$time.textContent=readableDate
	$time.dateTime=timestamp
	return $time
}

function makeUserLink(server: Server, data: OsmBase): HTMLElement {
	const $a=(data.user
		? makeUserNameLink(server,data.user)
		: makeUserIdLink(server,data.uid)
	)
	$a.classList.add('listened')
	$a.dataset.userName=data.user
	$a.dataset.userId=String(data.uid)
	return $a
}

function makeUserNameLink(server: Server, username: string): HTMLAnchorElement {
	const fromName=(name: string)=>server.web.getUrl(e`user/${name}`)
	return makeLink(username,fromName(username))
}

function makeUserIdLink(server: Server, uid: number): HTMLAnchorElement {
	const fromId=(id: number)=>server.api.getUrl(e`user/${id}`)
	return makeLink('#'+uid,fromId(uid))
}

function getElementName(element: OsmElementBase): string {
	if (element.tags?.name) {
		return `${element.tags.name} (${element.id})`
	} else {
		return String(element.id)
	}
}

function capitalize(s: string): string {
	return s[0].toUpperCase()+s.slice(1)
}
