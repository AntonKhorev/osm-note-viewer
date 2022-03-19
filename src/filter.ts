import {Note, NoteComment} from './data'

export default class Filter {
	private odd: boolean // fake filter
	constructor(query: string, uidMatcher: (uid: number, matchUser: string) => boolean) {
		// TODO
		this.odd=!!query // fake filter
	}
	matchNote(note: Note): boolean {
		if (this.odd) return !!(note.id%2) // fake filter
		return true
	}
}
