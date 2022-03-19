import NoteFilter from './filter'

export default class NoteFilterPanel {
	noteFilter: NoteFilter
	private callback?: (noteFilter: NoteFilter) => void
	constructor($container: HTMLElement, uidMatcher: (uid: number, matchUser: string) => boolean) {
		const $form=document.createElement('form')
		{
			const $div=document.createElement('div')
			$div.classList.add('major-input')
			const $textarea=document.createElement('textarea')
			const $label=document.createElement('label')
			$label.append(`Filter: `,$textarea)
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
		$container.append($form)
		this.noteFilter=new NoteFilter('',uidMatcher)
		// TODO form submit handler - callback
	}
	subscribe(callback: (noteFilter: NoteFilter) => void) {
		this.callback=callback
	}
	unsubscribe() {
		this.callback=undefined
	}
}
