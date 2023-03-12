import type Server from './server'
import type {OsmChangesetWithBbox} from './osm'
import {hasBbox, getChangesetFromOsmApiResponse, getElementsFromOsmApiResponse} from './osm'
import {toUrlDate} from './query-date'
import {bubbleCustomEvent} from './html'
import {makeEscapeTag} from './escape'

const e=makeEscapeTag(encodeURIComponent)

export default class OsmDownloader {
	constructor($root: HTMLElement, server: Server) {
		let abortController: AbortController|undefined
		const handleOsmDownloadAndLink=async(
			$a: HTMLAnchorElement,
			path: string,
			type: string,
			handleResponse: (response: Response)=>Promise<void>
		): Promise<void>=>{
			$a.classList.add('loading') // TODO aria
			if (abortController) abortController.abort()
			abortController=new AbortController()
			try {
				const response=await server.api.fetch(path,{signal:abortController.signal})
				if (!response.ok) {
					if (response.status==404) {
						throw new TypeError(`${type} doesn't exist`)
					} else if (response.status==410) {
						throw new TypeError(`${type} was deleted`)
					} else {
						throw new TypeError(`OSM API error: unsuccessful response`)
					}
				}
				await handleResponse(response)
				$a.classList.remove('absent')
				$a.title=''
			} catch (ex) {
				// TODO maybe fail or clear event
				if (ex instanceof DOMException && ex.name=='AbortError') {
					return
				}
				$a.classList.add('absent')
				if (ex instanceof TypeError) {
					$a.title=ex.message
				} else {
					$a.title=`unknown error ${ex}`
				}
			} finally {
				$a.classList.remove('loading')
			}
		}
		$root.addEventListener('osmNoteViewer:changesetLinkClick',async(ev)=>{
			const $a=ev.target
			if (!($a instanceof HTMLAnchorElement)) return
			const changesetId=$a.dataset.changesetId
			if (!changesetId) return
			await handleOsmDownloadAndLink($a,e`changeset/${changesetId}.json`,`changeset`,async(response)=>{
				const data=await response.json()
				const changeset=getChangesetFromOsmApiResponse(data)
				if (!hasBbox(changeset)) throw new TypeError(`changeset is empty`)
				if ($a.dataset.adiff) {
					if (!server.overpass) throw new TypeError(`no overpass provider`)
					const query=makeAdiffQueryPreamble(changeset)+
						`(node(changed);way(changed););\n`+
						`out meta geom;`
					const doc=await server.overpass.fetch(query)
					bubbleCustomEvent($root,'osmNoteViewer:changesetRender',changeset) // TODO render adiff instead
					// bubbleCustomEvent($root,'osmNoteViewer:changesetAdiffRender',doc)
				} else {
					bubbleCustomEvent($root,'osmNoteViewer:changesetRender',changeset)
				}
			})
		})
		$root.addEventListener('osmNoteViewer:elementLinkClick',async(ev)=>{
			const $a=ev.target
			if (!($a instanceof HTMLAnchorElement)) return
			const elementType=$a.dataset.elementType
			if (elementType!='node' && elementType!='way' && elementType!='relation') return false
			const elementId=$a.dataset.elementId
			if (!elementId) return
			const fullBit=(elementType=='node' ? '' : '/full')
			handleOsmDownloadAndLink($a,e`${elementType}/${elementId}`+`${fullBit}.json`,`element`,async(response)=>{
				const data=await response.json()
				const elements=getElementsFromOsmApiResponse(data)
				const element=elements[elementType][elementId]
				if (!element) throw new TypeError(`OSM API error: requested element not found in response data`)
				bubbleCustomEvent($root,'osmNoteViewer:elementRender',[element,elements])
			})
		})
	}
}

/**
 * Make augmented diff overpass query preamble for changeset.
 *
 * Time range is (created_at - 1 second) .. (closed_at if closed).
 * Similar to what achavi does, see https://github.com/nrenner/achavi/blob/9934871777b6e744d21bb2f22b112d386bcd9d30/js/map.js#L261
 */
function makeAdiffQueryPreamble(changeset: OsmChangesetWithBbox): string {
	const startDate=toUrlDate(Date.parse(changeset.created_at)/1000-1,'-')
	const endPart=changeset.closed_at!=null?`,"${changeset.closed_at}"`:``
	const swneBounds=(
		changeset.minlat+','+changeset.minlon+','+
		changeset.maxlat+','+changeset.maxlon
	)
	return (
		`[adiff:"${startDate}"${endPart}]\n`+
		`[bbox:${swneBounds}]\n`+
		`;\n`
	)
}
