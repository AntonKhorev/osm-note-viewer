import Server from '../server'
import type {OsmBase, OsmElementBase, OsmAdiffElement} from '../osm'
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
			const changesetHref=server.web.getUrl(e`changeset/${changeset.id}`)
			const headerContents: (string|HTMLElement)[] = [
				`Changeset: `,makeLink(String(changeset.id),changesetHref)
			]
			if (layerData.adiff) {
				headerContents.push(
					` · `,makeChangesetLink(server,changeset.id,`Hide adiff`)
				)
			} else {
				if (server.overpass) headerContents.push(
					` · `,makeChangesetAdiffLink(server,changeset.id,`Show adiff`)
				)
			}
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
			const $tags=makeTagsFigure(changeset.tags,'comment')
			if ($tags) $popup.append($tags)
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
					makeElementAdiffTable(server,oldElement,newElement)
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

function makeElementAdiffTable(server: Server, oldElement: OsmAdiffElement, newElement: OsmAdiffElement): HTMLElement {
	const $figure=document.createElement('figure')
	const $table=document.createElement('table')
	$figure.append($table)
	$table.insertRow().append(
		makeElement('th')()(`timestamp`),
		makeElement('td')()(makeDate(oldElement.timestamp,true)),
		makeElement('td')()(makeDate(newElement.timestamp,true))
	)
	$table.insertRow().append(
		makeElement('th')()(`user`),
		makeElement('td')()(makeUserLink(server,oldElement)),
		makeElement('td')()(makeUserLink(server,newElement)),
	)
	$table.insertRow().append(
		makeElement('th')()(`version`),
		makeElement('td')()(String(oldElement.version)),
		makeElement('td')()(String(newElement.version)),
	)
	$table.insertRow().append(
		makeElement('th')()(`changeset`),
		makeElement('td')()(makeChangesetLink(server,oldElement.changeset)),
		makeElement('td')()(makeChangesetLink(server,newElement.changeset)),
	)
	const allKeys=new Set<string>()
	if (oldElement.tags) {
		for (const k of Object.keys(oldElement.tags)) {
			allKeys.add(k)
		}
	}
	if (newElement.tags) {
		for (const k of Object.keys(newElement.tags)) {
			allKeys.add(k)
		}
	}
	if (allKeys.size==0) return $figure
	const sortedAllKeys=[...allKeys.values()].sort()
	const changedKeys=[] as string[]
	const unchangedKeys=[] as string[]
	for (const k of sortedAllKeys) {
		((oldElement.tags?.[k]==newElement.tags?.[k])?unchangedKeys:changedKeys).push(k)
	}
	$table.insertRow().append(
		makeElement('th')()(`tags`),
		makeElement('td')()(),
		makeElement('td')()(),
	)
	const tagList=[...changedKeys,...unchangedKeys].map(k=>[
		k,
		oldElement.tags?.[k]??'',
		newElement.tags?.[k]??''
	] as [k:string,...vs:string[]])
	startWritingTags($figure,$table,tagList)
	return $figure
}

function makeTagsFigure(tags: {[key:string]:string}|undefined, skipKey?: string): HTMLElement|null {
	if (!tags) return null
	const tagList=Object.entries(tags).filter(([k])=>k!=skipKey)
	if (tagList.length<=0) return null
	const $figure=document.createElement('figure')
	const $figcaption=document.createElement('figcaption')
	$figcaption.textContent=`Tags`
	const $table=document.createElement('table')
	$figure.append($figcaption,$table)
	startWritingTags($figure,$table,tagList)
	return $figure
}

function startWritingTags($figure: HTMLElement, $table: HTMLTableElement, tagList: [k:string,...vs:string[]][]): void {
	const tagBatchSize=10
	let $button: HTMLButtonElement|undefined
	let i=0
	writeTagBatch()
	function writeTagBatch() {
		for (let j=0;i<tagList.length&&j<tagBatchSize;i++,j++) {
			const [k,...vs]=tagList[i]
			const $row=$table.insertRow()
			const $keyCell=$row.insertCell()
			$keyCell.textContent=k
			if (k.length>30) $keyCell.classList.add('long')
			for (const v of vs) {
				$row.insertCell().textContent=v
			}
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

function makeChangesetAdiffLink(server: Server, changesetId: number, text: string): HTMLElement {
	const $a=makeChangesetLink(server,changesetId)
	$a.innerText=text
	$a.dataset.adiff='true'
	return $a
}

function makeChangesetLink(server: Server, changesetId: number, text?: string): HTMLElement {
	const cid=String(changesetId)
	const $a=makeLink(text??cid,server.web.getUrl(e`changeset/${cid}`))
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

function makeDate(timestamp: string, short=false): HTMLElement {
	const readableDate=timestamp.replace('T',' ').replace('Z','')
	const $time=document.createElement('time')
	$time.classList.add('listened')
	if (short) {
		$time.title=readableDate+` UTC`
		;[$time.textContent]=readableDate.split(' ',1)
	} else {
		$time.textContent=readableDate
	}
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
