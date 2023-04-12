import type {ApiProvider} from './net'
import type {OsmNoteApiData} from './osm'
import {getNoteFromOsmApiResponse} from './osm'
import type {Note, Users} from './data'
import {transformFeatureToNotesAndUsers} from './data'
import {makeEscapeTag} from './util/escape'

const e=makeEscapeTag(encodeURIComponent)

/**
 * Errors expected with working connection to the API
 */
export class NoteDataError extends TypeError {}

export function getFetchTableNoteErrorMessage(ex: unknown) {
	if (ex instanceof TypeError) {
		return ex.message
	} else {
		return `unknown error ${ex}`
	}
}

/**
 * Reload a single note updating its link
 */
export default async function fetchTableNote(
	api: ApiProvider,
	noteId: number,
	token?: string
): Promise<[note:Note,users:Users]> {
	const response=await api.fetch.withToken(token)(e`notes/${noteId}.json`)
	if (!response.ok) throw new NoteDataError(`note reload failed`)
	const noteAndUsers=await readNoteResponse(noteId,response)
	return noteAndUsers
}

export async function readNoteResponse(
	noteId: number,
	response: Response
): Promise<[note:Note,users:Users]> {
	const data=await response.json()
	let noteFeature: OsmNoteApiData
	try {
		noteFeature=getNoteFromOsmApiResponse(data)
	} catch {
		throw new NoteDataError(`note reload received invalid data`)
	}
	const [newNotes,newUsers]=transformFeatureToNotesAndUsers(noteFeature)
	if (newNotes.length!=1) throw new NoteDataError(`note reload received unexpected number of notes`)
	const [newNote]=newNotes
	if (newNote.id!=noteId) throw new NoteDataError(`note reload received unexpected note`)
	return [newNote,newUsers]
}
