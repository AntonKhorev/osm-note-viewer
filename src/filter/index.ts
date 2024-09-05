import type {Note} from '../data'
import type {ApiUrlLister, WebUrlLister} from '../net'
import {toUserQuery} from '../query'

import type {Statement} from './parser'
import {parseFilterString} from './parser'
import {matchNote} from './runner'

export default class NoteFilter {
	private statements: Statement[] = []
	constructor(apiUrlLister: ApiUrlLister, webUrlLister: WebUrlLister, private query: string) {
		this.statements=parseFilterString(query,user=>toUserQuery(apiUrlLister,webUrlLister,user))
	}
	isSameQuery(query: string): boolean {
		return this.query==query
	}
	matchNote(note: Note, getUsername: (uid: number) => string|undefined): boolean {
		return matchNote(this.statements,note,getUsername)
	}
}
