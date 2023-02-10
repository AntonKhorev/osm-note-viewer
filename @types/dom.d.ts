declare global {
	interface HTMLElementEventMap {
		'osmNoteViewer:changeTimestamp': CustomEvent<string>
		'osmNoteViewer:focusOnNote': CustomEvent<number>
		'osmNoteViewer:changeMapFitMode': CustomEvent<string>
		'osmNoteViewer:changeNoteCounts': CustomEvent<[nFetched: number, nVisible: number, nSelected: number]>
	}
}
export {}
