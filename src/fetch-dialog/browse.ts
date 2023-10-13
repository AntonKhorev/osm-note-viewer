import type {QueryCaptionItem} from './dynamic'
import DynamicNoteFetchDialog from './dynamic'
import type {NoteQuery} from '../query'
import {makeNoteBrowseQueryFromValues} from '../query'
import {bubbleCustomEvent} from '../util/events'
import {makeLink} from '../util/html'
import {p,em,code} from '../util/html-shortcuts'

const minSafeZoom=8

export default class NoteBrowseFetchDialog extends DynamicNoteFetchDialog {
	shortTitle=`Browse`
	title=`Get notes inside map view`
	fetchIfValid(): void {
		if (!this.withSafeZoom) return
		super.fetchIfValid()
	}
	private get withSafeZoom(): boolean {
		return this.map.zoom>=minSafeZoom
	}
	protected makeLeadAdvancedHint(): Array<string|HTMLElement> {
		return [p(
			`Make a `,makeLink(`notes in bounding box`,`https://wiki.openstreetmap.org/wiki/API_v0.6#Retrieving_notes_data_by_bounding_box:_GET_/api/0.6/notes`),
			` request at `,code(this.cx.server.api.getUrl(`notes?`),em(`parameters`)),` like the `,makeLink(`note layer`,`https://wiki.openstreetmap.org/wiki/Notes#Viewing_notes`),`; see `,em(`BBox`),` tab for `,em(`parameters`),` descriptions.`
		)]
	}
	protected getClosedLineNotesText(): string {
		return `most recently updated notes`
	}
	protected limitValues=[20,100,500,2500,10000]
	protected limitDefaultValue=100 // higher default limit because no progressive loads possible
	protected limitLeadText=`Download `
	protected limitLabelBeforeText=`at most `
	protected limitLabelAfterText=` notes`
	protected limitIsParameter=true
	protected get defaultClosedValue(): string {
		return '7'
	}
	protected addEventListenersBeforeClosedLine(): void {
		this.$root.addEventListener('osmNoteViewer:mapMoveEnd',()=>{
			this.updateMapZoomMessage()
			this.updateRequest()
			this.updateNotesIfNeeded()
		})
	}
	protected onClosedValueChange(): void {
		this.updateNotesIfNeeded()
	}
	protected constructQuery(): NoteQuery | undefined {
		const bboxValue=this.map.precisionMarkerBounds.wsen.join(',')
		return makeNoteBrowseQueryFromValues(
			bboxValue,this.closedValue
		)
	}
	protected listQueryChangingInputsWithoutBbox(): Array<HTMLInputElement|HTMLSelectElement> {
		return [
			this.$closedInput,this.$closedSelect
		]
	}
	onOpen(): void {
		this.map.freezeMode=true
		this.updateMapZoomMessage()
		this.updateNotesIfNeeded()
	}
	onClose(): void {
		this.map.freezeMode=false
		this.clearMapZoomMessage()
	}
	private updateMapZoomMessage(): void {
		if (!this.open) return
		if (this.withSafeZoom) {
			this.clearMapZoomMessage()
		} else {
			bubbleCustomEvent(this.$form,'osmNoteViewer:mapMessageDisplay',`Zoom in to level ${minSafeZoom} to see notes`)
		}
	}
	private clearMapZoomMessage(): void {
		bubbleCustomEvent(this.$form,'osmNoteViewer:mapMessageDisplay',null)
	}
	private updateNotesIfNeeded(): void {
		if (this.open && this.withSafeZoom) {
			this.$form.requestSubmit()
		}
	}
	protected getQueryCaptionItems(query: NoteQuery, extraQueryCaptionItems: QueryCaptionItem[]): QueryCaptionItem[] {
		if (query.mode!='browse') return []
		return [
			...extraQueryCaptionItems,
			[`bounding box `,query.bbox] // has to be here because there's no input
		]
	}
}
