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
 */
export interface NoteComment {
	date: number
	uid?: number
	action: 'opened' | 'closed' | 'reopened' | 'commented' | 'hidden'
	text: string
}

export interface Users {
	[uid: number]: string | undefined
}
