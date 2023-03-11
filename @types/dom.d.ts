import type {Note, Users} from '../src/data'
import type {OsmChangeset, OsmElement, OsmElementMap} from '../src/osm'

declare global {
	interface HTMLElementEventMap {
		'osmNoteViewer:timestampChange': CustomEvent<string>
		'osmNoteViewer:noteFocus': CustomEvent<number>
		'osmNoteViewer:mapFitModeChange': CustomEvent<string>
		'osmNoteViewer:noteCountsChange': CustomEvent<readonly [nFetched: number, nVisible: number, nSelected: number]>
		'osmNoteViewer:notesInput': CustomEvent<readonly [inputNotes: ReadonlyArray<Note>, inputNoteUsers: ReadonlyMap<number,string>]>
		'osmNoteViewer:mapMoveTrigger': CustomEvent<{zoom: string, lat: string, lon: string}> // strings because fixed precision
		'osmNoteViewer:mapMoveEnd': CustomEvent<{zoom: string, lat: string, lon: string}>
		'osmNoteViewer:imageToggle': CustomEvent<{urls: string[], index: number}>
		'osmNoteViewer:toolsToggle': CustomEvent<boolean>
		'osmNoteViewer:queryHashChange': CustomEvent<string>
		'osmNoteViewer:newNoteStream': CustomEvent<readonly [queryHash: string, isNewStart: boolean]>
		'osmNoteViewer:beforeNoteFetch': CustomEvent<number>
		'osmNoteViewer:failedNoteFetch': CustomEvent<readonly [id: number, message: string]>
		'osmNoteViewer:noteFetch': CustomEvent<readonly [note: Note, users: Users, updateType?: 'manual']>
		'osmNoteViewer:noteUpdatePush': CustomEvent<readonly [note: Note, users: Users]>
		'osmNoteViewer:noteRender': CustomEvent<Note>
		'osmNoteViewer:noteRefreshWaitProgress': CustomEvent<readonly [id: number, progress: number]>
		'osmNoteViewer:notesInViewportChange': CustomEvent<readonly Note[]>
		'osmNoteViewer:changesetRender': CustomEvent<OsmChangeset>
		'osmNoteViewer:elementRender': CustomEvent<readonly [OsmElement, OsmElementMap]>
	}
}
export {}
