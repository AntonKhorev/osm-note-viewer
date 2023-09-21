import NoteFilter from './filter'
import type {SimpleStorage} from './util/storage'
import {getStorageString, setStorageString} from './util/storage'
import type {ApiUrlLister, WebUrlLister} from './net'
import makeCodeForm from './util/code-form'
import {makeElement} from './util/html'

const syntaxDescription=`<summary>Filter syntax</summary>
<ul>
<li>Blank lines are ignored
<li>Leading/trailing spaces are ignored
<li>Each line is a note comment/action ${term('comment match statement')}
<li>Comments and actions are the same things, we'll call them <em>comments</em> because that's how they are referred to by API/DB: each action is accompanied by a possibly empty comment, commenting without closing/opening is also an action
<li>${term('comment match statement')}s form a sequence that has to match a subsequence of note comments, like a <a href='https://en.wikipedia.org/wiki/Regular_expression'>regular expression</a>
</ul>
<dl>
<dt>${term('comment match statement')}
<dd>One of:
	<ul>
	<li><dl><dt><kbd>^</kbd>
		<dd>beginning of comment sequence: next ${term('comment match statement')} is checked against the first note comment
	</dl>
	<li><dl><dt><kbd>$</kbd>
		<dd>end of comment sequence: previous ${term('comment match statement')} is checked against the last note comment
	</dl>
	<li><dl><dt><kbd>*</kbd>
		<dd>any sequence of comments, including an empty one
	</dl>
	<li><dl><dt>${term('comment condition')} [<kbd>,</kbd> ${term('comment condition')}]*
		<dd>one comment satisfying every condition in this comma-separated list
	</dl>
	</ul>
<dt>${term('comment condition')}
<dd>One of:
	<ul>
	<li><dl><dt><kbd>user </kbd>${term('comparison operator')}<kbd> </kbd>${term('user descriptor')}
		<dd>comment (not) by a specified user
	</dl>
	<li><dl><dt><kbd>action </kbd>${term('comparison operator')}<kbd> </kbd>${term('action descriptor')}
		<dd>comment (not) performing a specified action
	</dl>
	<li><dl><dt><kbd>text </kbd>${term('comparison operator')}<kbd> "</kbd>${term('search string')}<kbd>"</kbd>
		<dd>comment (not) equal to a specified text
	</dl>
	</ul>
<dt>${term('comparison operator')}
<dd>One of: <kbd>=</kbd> <kbd>!=</kbd> <kbd>~=</kbd> (case-insensitive substring match)
<dt>${term('user descriptor')}
<dd>OSM username, URL or #id, like in a fetch query input. Additionally you can specify username <kbd>0</kbd> or id <kbd>#0</kbd> to match anonymous users. No user with actual name "0" can exist because it's too short.
<dt>${term('action descriptor')}
<dd>One of: <kbd>opened</kbd> <kbd>closed</kbd> <kbd>reopened</kbd> <kbd>commented</kbd> <kbd>hidden</kbd>
</dl>`

const syntaxExamples: [string,string[]][] = [
	[`Notes commented by user A`,[`user = A`]],
	[`Notes commented by user A, later commented by user B`,[`user = A`,`*`,`user = B`]],
	[`Notes opened by user A`,[`^`,`user = A`]],
	[`Notes opened by an anonymous user`,[`^`,`user = 0`]],
	[`Notes closed by user A that were opened by somebody else`,[`^`,`user != A`,`*`,`user = A, action = closed`]],
	[`Notes closed without a comment as their last action`,[`action = closed, text = ""`,`$`]],
]

function term(t:string):string {
	return `<em>&lt;${t}&gt;</em>`
}

export default class NoteFilterPanel {
	noteFilter: NoteFilter
	onFilterUpdate?: (noteFilter: NoteFilter) => void
	constructor(
		storage: SimpleStorage,
		apiUrlLister: ApiUrlLister, webUrlLister: WebUrlLister,
		$container: HTMLElement
	) {
		this.noteFilter=new NoteFilter(apiUrlLister,webUrlLister,``)
		const $form=makeCodeForm(
			'',getStorageString(storage,'filter'),
			[makeInlineIcon('filter'),` Note filter`],`Filter`,`Apply filter`,
			input=>this.noteFilter.isSameQuery(input),
			input=>new NoteFilter(apiUrlLister,webUrlLister,input),
			input=>{
				this.noteFilter=new NoteFilter(apiUrlLister,webUrlLister,input)
				setStorageString(storage,'filter',input)
			},
			()=>{
				this.onFilterUpdate?.(this.noteFilter)
			},
			syntaxDescription,syntaxExamples
		)
		$container.append($form)
	}
}

function makeInlineIcon(type: string): HTMLElement {
	const $span=makeElement('span')(`icon`)()
	$span.innerHTML=`<svg width="13" height="16" viewBox="0 1.5 13 16"><use href="#tools-${type}" /></svg>`
	return $span
}
