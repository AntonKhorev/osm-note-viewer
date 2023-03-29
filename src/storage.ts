import {PrefixedLocalStorage} from './util/storage'

export default class NoteViewerStorage extends PrefixedLocalStorage {
	constructor() {
		super('osm-note-viewer-')
	}
}
