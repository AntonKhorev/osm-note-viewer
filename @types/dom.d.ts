import type {Note} from '../src/data'

declare global {
	interface HTMLElementEventMap {
		'osmNoteViewer:changeTimestamp': CustomEvent<string>
		'osmNoteViewer:focusOnNote': CustomEvent<number>
		'osmNoteViewer:changeMapFitMode': CustomEvent<string>
		'osmNoteViewer:changeNoteCounts': CustomEvent<readonly [nFetched: number, nVisible: number, nSelected: number]>
		'osmNoteViewer:changeInputNotes': CustomEvent<readonly [inputNotes: ReadonlyArray<Note>, inputNoteUsers: ReadonlyMap<number,string>]>
		'osmNoteViewer:toggleTools': CustomEvent<boolean>
		'osmNoteViewer:changeRefresherState': CustomEvent<readonly [isRunning: boolean, message: string|undefined]>
	}
}
export {}
