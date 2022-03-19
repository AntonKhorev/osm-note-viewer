import {Note, NoteComment} from './data'

export default class NoteFilter {
	private username?: string
	constructor(query: string) {
		const match=query.match(/^\s*user\s*=\s*(.+?)\s*$/)
		if (match) {
			[,this.username]=match
		}
	}
	matchNote(note: Note, uidMatcher: (uid: number, matchUser: string) => boolean): boolean {
		if (this.username==null) return true
		for (const comment of note.comments) {
			if (comment.uid==null) continue
			if (uidMatcher(comment.uid,this.username)) return true
		}
		return false
	}
}
