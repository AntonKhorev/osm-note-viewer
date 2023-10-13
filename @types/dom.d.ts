import type {Note, Users} from '../src/data'
import type {OsmChangesetApiData, OsmVisibleElementApiData, OsmVisibleElementApiDataMap} from '../src/osm'
import type {OsmAdiff} from '../src/osm-adiff'

declare global {
	interface HTMLElementEventMap {
		'osmNoteViewer:menuToggle': CustomEvent<undefined|'login'|'image-sources'>
		'osmNoteViewer:timestampChange': CustomEvent<string>
		'osmNoteViewer:noteFocus': CustomEvent<[noteId: number, isNegativeZoom: boolean]>
		'osmNoteViewer:mapFitModeChange': CustomEvent<string>
		'osmNoteViewer:noteCountsChange': CustomEvent<readonly [nFetched: number, nVisible: number, nSelected: number]>
		'osmNoteViewer:notesInput': CustomEvent<readonly [inputNotes: ReadonlyArray<Note>, inputNoteUsers: ReadonlyMap<number,string>]>
		'osmNoteViewer:mapMoveTrigger': CustomEvent<{zoom: string, lat: string, lon: string}> // strings because fixed precision
		'osmNoteViewer:mapMoveEnd': CustomEvent<{zoom: string, lat: string, lon: string}>
		'osmNoteViewer:imageToggle': CustomEvent<{urls: string[], index: number}>
		'osmNoteViewer:mapMessageDisplay': CustomEvent<string|null>
		'osmNoteViewer:queryHashChange': CustomEvent<string>
		'osmNoteViewer:newNoteStream': CustomEvent<readonly [queryHash: string, isNewHistoryEntry: boolean]>
		'osmNoteViewer:beforeNoteFetch': CustomEvent<number>
		'osmNoteViewer:failedNoteFetch': CustomEvent<readonly [id: number, message: string]>
		'osmNoteViewer:noteFetch': CustomEvent<readonly [note: Note, users: Users, updateType?: 'manual']>
		'osmNoteViewer:noteUpdatePush': CustomEvent<readonly [note: Note, users: Users]>
		'osmNoteViewer:noteRender': CustomEvent<Note>
		'osmNoteViewer:noteRefreshWaitProgress': CustomEvent<readonly [id: number, progress: number]>
		'osmNoteViewer:notesInViewportChange': CustomEvent<readonly Note[]>
		'osmNoteViewer:elementRender': CustomEvent<readonly [OsmVisibleElementApiData, OsmVisibleElementApiDataMap]>
		'osmNoteViewer:changesetRender': CustomEvent<OsmChangesetApiData>
		'osmNoteViewer:changesetAdiffRender': CustomEvent<readonly [OsmChangesetApiData, OsmAdiff]>
	}
}
export {}
