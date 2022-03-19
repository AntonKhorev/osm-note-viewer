import {Note, NoteComment} from './data'

export default class NoteFilter {
	private odd: boolean // fake filter
	constructor(query: string) {
		// TODO
		this.odd=!!query // fake filter
	}
	matchNote(note: Note, uidMatcher: (uid: number, matchUser: string) => boolean): boolean {
		if (this.odd) return !!(note.id%2) // fake filter
		return true
	}
}
