declare global {
	interface HTMLElementEventMap {
		'osmNoteViewer:changeTimestamp': CustomEvent<string>,
		'osmNoteViewer:focusOnNote': CustomEvent<number>
	}
}
export {}
