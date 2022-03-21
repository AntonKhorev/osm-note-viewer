import NoteFilter from './filter'

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
	<li><dl><dt><kbd>user ${term('comparison operator')} ${term('user descriptor')}</kbd>
		<dd>comment (not) by a specified user
	</dl>
	<li><dl><dt><kbd>user ${term('comparison operator')} ${term('action descriptor')}</kbd>
		<dd>comment (not) performing a specified action
	</dl>
	</ul>
<dt>${term('comparison operator')}
<dd>One of: <kbd>=</kbd> <kbd>!=</kbd>
<dt>${term('user descriptor')}
<dd>OSM username, URL or #id, like in a fetch query input. Additionally you can specify username <kbd>0</kbd> or id <kbd>#0</kbd> to match anonymous users. No user with actual name "0" can exist because it's too short.
<dt>${term('action descriptor')}
<dd>One of: <kbd>opened</kbd> <kbd>closed</kbd> <kbd>reopened</kbd> <kbd>commented</kbd> <kbd>hidden</kbd>
</dl>`

const syntaxExamples: Array<[string,string[]]> = [
	[`Notes commented by user A`,[`user = A`]],
	[`Notes commented by user A, later commented by user B`,[`user = A`,`*`,`user = B`]],
	[`Notes opened by user A`,[`^`,`user = A`]],
	[`Notes closed by user A that were opened by somebody else`,[`^`,`user != A`,`*`,`user = A, action = closed`]],
]

function term(t:string):string {
	return `<em>&lt;${t}&gt;</em>`
}
function val(t:string):string {
	return `<em>${t}</em>`
}

export default class NoteFilterPanel {
	noteFilter: NoteFilter
	private callback?: (noteFilter: NoteFilter) => void
	constructor($container: HTMLElement) {
		const $form=document.createElement('form')
		const $textarea=document.createElement('textarea')
		const $button=document.createElement('button')
		this.noteFilter=new NoteFilter($textarea.value)
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
			const $div=document.createElement('div')
			$div.classList.add('major-input')
			$textarea.rows=5
			const $label=document.createElement('label')
			$label.append(`Filter:`,$textarea)
			$div.append($label)
			$form.append($div)
		}{
			const $div=document.createElement('div')
			$div.classList.add('major-input')
			$button.textContent=`Apply filter`
			$button.type='submit'
			$button.disabled=true
			$div.append($button)
			$form.append($div)
		}
		$textarea.addEventListener('input',()=>{
			$button.disabled=this.noteFilter.isSameQuery($textarea.value)
		})
		$form.addEventListener('submit',(ev)=>{
			ev.preventDefault()
			this.noteFilter=new NoteFilter($textarea.value)
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
