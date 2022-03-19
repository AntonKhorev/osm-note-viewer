import NoteFilter from './filter'

export default class NoteFilterPanel {
	noteFilter: NoteFilter
	private callback?: (noteFilter: NoteFilter) => void
	constructor($container: HTMLElement) {
		const $form=document.createElement('form')
		const $textarea=document.createElement('textarea')
		this.noteFilter=new NoteFilter($textarea.value)
		{
			const $div=document.createElement('div')
			$div.classList.add('major-input')
			const $label=document.createElement('label')
			const $code=document.createElement('code')
			$code.textContent=`user = username`
			$label.append(`Filter: (only single `,$code,` clause supported for now)`,$textarea)
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
