import type {ApiProvider} from './server'
import {getChangesetFromOsmApiResponse, getElementsFromOsmApiResponse} from './osm'
import {bubbleCustomEvent} from './html'
import {makeEscapeTag} from './escape'

const e=makeEscapeTag(encodeURIComponent)

export default class OsmDownloader {
	constructor($root: HTMLElement, api: ApiProvider) {
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
				const response=await api.fetch(path,{signal:abortController.signal})
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
				bubbleCustomEvent($root,'osmNoteViewer:changesetRender',changeset)
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
