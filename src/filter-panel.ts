import NoteFilter from './filter'
import {makeDiv, makeLabel} from './util'

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

const syntaxExamples: Array<[string,string[]]> = [
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
	private callback?: (noteFilter: NoteFilter) => void
	constructor($container: HTMLElement) {
		const $form=document.createElement('form')
		const $textarea=document.createElement('textarea')
		const $button=document.createElement('button')
		this.noteFilter=new NoteFilter(``)
		{
			const $details=document.createElement('details')
			$details.innerHTML=syntaxDescription
			const $examplesTitle=document.createElement('p')
			$examplesTitle.innerHTML='<strong>Examples</strong>:'
			const $examplesList=document.createElement('dl')
			$examplesList.classList.add('examples')
			for (const [title,codeLines] of syntaxExamples) {
				const $dt=document.createElement('dt')
				$dt.append(title)
				const $dd=document.createElement('dd')
				const $code=document.createElement('code')
				$code.textContent=codeLines.join('\n')
				$dd.append($code)
				$examplesList.append($dt,$dd)
			}
			$details.append($examplesTitle,$examplesList)
			$form.append($details)
		}{
			$textarea.rows=5
			$form.append(makeDiv('major-input')(makeLabel()(
				`Filter: `,$textarea
			)))
		}{
			$button.textContent=`Apply filter`
			$button.type='submit'
			$button.disabled=true
			$form.append(makeDiv('major-input')($button))
		}
		$textarea.addEventListener('input',()=>{
			$button.disabled=this.noteFilter.isSameQuery($textarea.value)
			try {
				new NoteFilter($textarea.value)
				$textarea.setCustomValidity('')
			} catch (ex) {
				let message=`Syntax error`
				if (ex instanceof RangeError) message=ex.message
				$textarea.setCustomValidity(message)
			}
		})
		$form.addEventListener('submit',(ev)=>{
			ev.preventDefault()
			try {
				this.noteFilter=new NoteFilter($textarea.value)
			} catch (ex) {
				return
			}
			if (this.callback) this.callback(this.noteFilter)
			$button.disabled=true
		})
		$container.append($form)
	}
	subscribe(callback: (noteFilter: NoteFilter) => void) {
		this.callback=callback
	}
	unsubscribe() {
		this.callback=undefined
	}
}
