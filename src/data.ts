/**
 * notes as received from the server
 */
export interface NoteFeatureCollection {
	type: "FeatureCollection"
	features: NoteFeature[]
}

export function isNoteFeatureCollection(data: any): data is NoteFeatureCollection {
	return data.type=="FeatureCollection"
}

/**
 * single note as received from the server
 */
export interface NoteFeature {
	type: "Point"
	geometry: {
		coordinates: [lon: number, lat: number]
	}
	properties: {
		id: number
		status: 'open' | 'closed' | 'hidden'
		comments: NoteFeatureComment[]
	}
}

export function isNoteFeature(data: any): data is NoteFeature {
	return data.type=="Point"
}

/**
 * single note comment as received from the server
 */
export interface NoteFeatureComment {
	date: string
	uid?: number
	user?: string
	action: 'opened' | 'closed' | 'reopened' | 'commented' | 'hidden'
	text: string
}

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

export function transformFeatureCollectionToNotesAndUsers(data: NoteFeatureCollection): [Note[], Users] {
	const users: Users = {}
	const notes=data.features.map(noteFeature=>({ // TODO make sure note has at least one comment
		id: noteFeature.properties.id,
		lat: noteFeature.geometry.coordinates[1],
		lon: noteFeature.geometry.coordinates[0],
		status: noteFeature.properties.status,
		comments: noteFeature.properties.comments.map(cullCommentProps)
	}))
	return [notes,users]
	function cullCommentProps(a: NoteFeatureComment): NoteComment {
		const b:NoteComment={
			date: transformDate(a.date),
			action: a.action,
			text: a.text
		}
		if (a.uid!=null) {
			b.uid=a.uid
			if (a.user!=null) users[a.uid]=a.user
		}
		return b
	}
	function transformDate(a: string): number {
		const match=a.match(/^\d\d\d\d-\d\d-\d\d\s+\d\d:\d\d:\d\d/)
		if (!match) return 0 // shouldn't happen
		const [s]=match
		return Date.parse(s+'Z')/1000
	}
}
