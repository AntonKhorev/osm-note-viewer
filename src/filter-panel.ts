import NoteFilter from './filter'

const syntaxDescription=`<summary>Filter syntax</summary>
<ul>
<li>Blank lines are ignored
<li>Leading/trailing spaces are ignored
<li>Each line is a note comment/action ${term('match statement')}
<li>Comments and actions are the same things, we'll call them <em>comments</em> because that's how they are referred to by API/DB: each action is accompanied by a possibly empty comment, commenting without closing/opening is also an action
<li>${term('match statement')}s form a sequence that has to match a subsequence of note comments, like a <a href='https://en.wikipedia.org/wiki/Regular_expression'>regular expression</a>
</ul>
<dl>
<dt>${term('match statement')}
<dd>One of:
	<ul>
	<li><dl><dt><kbd>^</kbd>
		<dd>beginning of comment sequence: next ${term('match statement')} is checked against the first note comment
	</dl>
	<li><dl><dt><kbd>$</kbd>
		<dd>end of comment sequence: previous ${term('match statement')} is checked against the last note comment
	</dl>
	<li><dl><dt><kbd>*</kbd>
		<dd>any sequence of comments, including an empty one
	</dl>
	<li><dl><dt><kbd>user = ${term('user descriptor')}</kbd>
		<dd>comment by a specified user
	</dl>
	</ul>
<dt>${term('user descriptor')}
<dd>One of:
	<ul>
	<li><dl><dt><kbd>0</kbd>
		<dd>anonymous user (no user with actual name "0" can exist because it's too short)
	</dl>
	<li><dl><dt>${val('username')}
		<dd>user name, also known as display name
	</dl>
	</ul>
</dl>`

const syntaxExamples: Array<[string,string[]]> = [
	[`Notes commented by user A`,[`user = A`]],
	[`Notes commented by user A, later commented by user B`,[`user = A`,`*`,`user = B`]],
	[`Notes opened by user A`,[`^`,`user = A`]],
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
			const $label=document.createElement('label')
			const $code=document.createElement('code')
			$code.textContent=`user = username`
			$label.append(`Filter:`,$textarea)
			$div.append($label)
			$form.append($div)
		}{
			const $div=document.createElement('div')
			$div.classList.add('major-input')
			const $button=document.createElement('button')
			$button.textContent=`Apply filter`
			$button.type='submit'
			$div.append($button)
			$form.append($div)
		}
		$form.addEventListener('submit',(ev)=>{
			ev.preventDefault()
			this.noteFilter=new NoteFilter($textarea.value)
			if (this.callback) this.callback(this.noteFilter)
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
