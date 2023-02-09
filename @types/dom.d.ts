declare global {
	interface HTMLElementEventMap {
		'osmNoteViewer:changeTimestamp': CustomEvent<string>
	}
}
export {}
