import type {OsmNoteCommentApiData, OsmNoteApiData} from './osm'

/**
 * Single note as saved in the local storage
 */
export interface Note {
	id: number
	lat: number
	lon: number
	status: 'open' | 'closed' | 'hidden'
	comments: NoteComment[]
}

/**
 * Single note comment as saved in the local storage
 *
 * May have a guessed flag if there were no visible comments and the opening date had to be converted into a comment.
 */
export interface NoteComment {
	date: number
	uid?: number
	action: 'opened' | 'closed' | 'reopened' | 'commented' | 'hidden'
	text: string
	guessed?: true
}

export interface Users {
	[uid: number]: string | undefined
}

export function transformFeaturesToNotesAndUsers(noteFeatures: OsmNoteApiData[]): [Note[], Users] {
	const users: Users = {}
	const notes=noteFeatures.map(noteFeature=>transformFeatureToNote(noteFeature,users))
	return [notes,users]
}

export function transformFeatureToNotesAndUsers(noteFeature: OsmNoteApiData): [Note[], Users] {
	const users: Users = {}
	const notes=[transformFeatureToNote(noteFeature,users)]
	return [notes,users]
}

function transformFeatureToNote(noteFeature: OsmNoteApiData, users: Users): Note {
	const note={
		id: noteFeature.properties.id,
		lat: noteFeature.geometry.coordinates[1],
		lon: noteFeature.geometry.coordinates[0],
		status: noteFeature.properties.status,
		comments: noteFeature.properties.comments.map(cullCommentProps)
	}
	if (note.comments.length==0) {
		note.comments=[makeGuessedOpeningComment(noteFeature)]
	} else if (note.comments[0].action!='opened') {
		note.comments.unshift(makeGuessedOpeningComment(noteFeature))
	}
	return note
	function cullCommentProps(a: OsmNoteCommentApiData): NoteComment {
		const b:NoteComment={
			date: transformDate(a.date),
			action: a.action,
			text: a.text ?? ''
		}
		if (a.uid!=null) {
			b.uid=a.uid
			if (a.user!=null) users[a.uid]=a.user
		}
		return b
	}
}

function makeGuessedOpeningComment(noteFeature: OsmNoteApiData): NoteComment {
	return {
		date: transformDate(noteFeature.properties.date_created),
		action: 'opened',
		text: '',
		guessed: true
	}
}

function transformDate(a: string): number {
	const match=a.match(/^\d\d\d\d-\d\d-\d\d\s+\d\d:\d\d:\d\d/)
	if (!match) return 0 // shouldn't happen
	const [s]=match
	return Date.parse(s+'Z')/1000
}

export function getNoteUpdateDate(note:Note):number {
	return note.comments[note.comments.length-1]?.date??0
}
