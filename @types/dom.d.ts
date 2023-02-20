import type {Note, Users} from '../src/data'

declare global {
	interface HTMLElementEventMap {
		'osmNoteViewer:changeTimestamp': CustomEvent<string>
		'osmNoteViewer:focusOnNote': CustomEvent<number>
		'osmNoteViewer:changeMapFitMode': CustomEvent<string>
		'osmNoteViewer:changeNoteCounts': CustomEvent<readonly [nFetched: number, nVisible: number, nSelected: number]>
		'osmNoteViewer:changeInputNotes': CustomEvent<readonly [inputNotes: ReadonlyArray<Note>, inputNoteUsers: ReadonlyMap<number,string>]>
		'osmNoteViewer:mapMoveTrigger': CustomEvent<{zoom: string, lat: string, lon: string}> // strings because fixed precision
		'osmNoteViewer:mapMoveEnd': CustomEvent<{zoom: string, lat: string, lon: string}>
		'osmNoteViewer:toggleTools': CustomEvent<boolean>
		'osmNoteViewer:beforeNoteFetch': CustomEvent<number>
		'osmNoteViewer:failedNoteFetch': CustomEvent<readonly [id: number, message: string]>
		'osmNoteViewer:noteFetch': CustomEvent<readonly [note: Note, users: Users, updateType?: 'manual']>
		'osmNoteViewer:pushNoteUpdate': CustomEvent<readonly [note: Note, users: Users]>
		'osmNoteViewer:renderNote': CustomEvent<Note>
		'osmNoteViewer:refreshNoteProgress': CustomEvent<readonly [id: number, progress: number]>
		'osmNoteViewer:observeNotesByRefresher': CustomEvent<readonly Note[]> // TODO don't limit to refresher - rename to viewport-something
	}
}
export {}
