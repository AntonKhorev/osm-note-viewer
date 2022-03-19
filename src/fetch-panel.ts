import NoteViewerStorage from './storage'
import {NoteMap} from './map'
import NoteFilterPanel from './filter-panel'
import ExtrasPanel from './extras-panel'
import {toUserQueryPart, NoteQuery, toNoteQueryStatus, toNoteQuerySort, toNoteQueryOrder} from './query'
import {startFetcher} from './fetch'

export default class NoteFetchPanel {
	constructor(
		storage: NoteViewerStorage,
		$container: HTMLElement,
		$notesContainer: HTMLElement, $moreContainer: HTMLElement, $commandContainer: HTMLElement,
		filterPanel: NoteFilterPanel, extrasPanel: ExtrasPanel, map: NoteMap
	) {
		const partialQuery: Partial<NoteQuery> = {}
		try {
			const queryString=storage.getItem('query')
			if (queryString!=null) {
				const parsedQuery=JSON.parse(queryString)
				if (typeof parsedQuery == 'object') {
					Object.assign(partialQuery,parsedQuery)
				}
			}
		} catch {}
		const $form=document.createElement('form')
		const $userInput=document.createElement('input')
		const $statusSelect=document.createElement('select')
		const $sortSelect=document.createElement('select')
		const $orderSelect=document.createElement('select')
		const $limitSelect=document.createElement('select')
		const $autoLoadCheckbox=document.createElement('input')
		const $fetchButton=document.createElement('button')
		{
			const $fieldset=document.createElement('fieldset')
			{
				const $legend=document.createElement('legend')
				$legend.textContent=`Scope and order`
				$fieldset.append($legend)
			}{
				$userInput.type='text'
				$userInput.name='user'
				$userInput.required=true
				if (partialQuery.userType=='id' && partialQuery.uid!=null) {
					$userInput.value='#'+partialQuery.uid
				} else if (partialQuery.userType=='name' && partialQuery.username!=null) {
					$userInput.value=partialQuery.username
				}
				const $div=document.createElement('div')
				$div.classList.add('major-input')
				const $label=document.createElement('label')
				$label.append(`OSM username, URL or #id: `,$userInput)
				$div.append($label)
				$fieldset.append($div)
			}{
				const $div=document.createElement('div')
				$statusSelect.append(
					new Option(`both open and closed`,'mixed'),
					new Option(`open and recently closed`,'recent'),
					new Option(`only open`,'open'),
					// new Option(`open followed by closed`,'separate') // TODO requires two fetch phases
				)
				if (partialQuery.status!=null) $statusSelect.value=partialQuery.status
				$sortSelect.append(
					new Option(`creation`,'created_at'),
					new Option(`last update`,'updated_at')
				)
				if (partialQuery.sort!=null) $sortSelect.value=partialQuery.sort
				$orderSelect.append(
					new Option('newest'),
					new Option('oldest')
				)
				if (partialQuery.order!=null) $orderSelect.value=partialQuery.order
				$div.append(
					span(`Fetch this user's `,$statusSelect,` notes`),` `,
					span(`sorted by `,$sortSelect,` date`),`, `,
					span($orderSelect,` first`)
				)
				$fieldset.append($div)
				function span(...items: Array<string|HTMLElement>): HTMLSpanElement {
					const $span=document.createElement('span')
					$span.append(...items)
					return $span
				}
			}
			$form.append($fieldset)
		}{
			const $fieldset=document.createElement('fieldset')
			{
				const $legend=document.createElement('legend')
				$legend.textContent=`Download mode (can change anytime)`
				$fieldset.append($legend)
			}{
				const $div=document.createElement('div')
				$limitSelect.append(
					new Option('20'),
					new Option('100'),
					new Option('500'),
					new Option('2500')
				)
				$div.append(
					`Download these in batches of `,$limitSelect,` notes`
				)
				$fieldset.append($div)
			}{
				$autoLoadCheckbox.type='checkbox'
				$autoLoadCheckbox.checked=true
				const $div=document.createElement('div')
				const $label=document.createElement('label')
				$label.append($autoLoadCheckbox,` Automatically load more notes when scrolled to the end of the table`)
				$div.append($label)
				$fieldset.append($div)
			}
			$form.append($fieldset)
		}{
			$fetchButton.textContent=`Fetch notes`
			$fetchButton.type='submit'
			const $div=document.createElement('div')
			$div.classList.add('major-input')
			$div.append($fetchButton)
			$form.append($div)
		}
		$userInput.addEventListener('input',()=>{
			const uqp=toUserQueryPart($userInput.value)
			if (uqp.userType=='invalid') {
				$userInput.setCustomValidity(uqp.message)
			} else {
				$userInput.setCustomValidity('')
			}
		})
		$form.addEventListener('submit',(ev)=>{
			ev.preventDefault()
			const uqp=toUserQueryPart($userInput.value)
			if (uqp.userType=='invalid') return
			const query: NoteQuery = {
				...uqp,
				status: toNoteQueryStatus($statusSelect.value),
				sort: toNoteQuerySort($sortSelect.value),
				order: toNoteQueryOrder($orderSelect.value),
				beganAt: Date.now()
			}
			extrasPanel.rewrite(query,Number($limitSelect.value))
			startFetcher(
				storage,
				$notesContainer,$moreContainer,$commandContainer,
				filterPanel,map,
				$limitSelect,$autoLoadCheckbox,$fetchButton,
				query,[],{}
			)
		})
		$container.append($form)
		const queryString=storage.getItem('query')
		if (queryString==null) {
			extrasPanel.rewrite()
			return
		}
		try {
			const query=JSON.parse(queryString)
			extrasPanel.rewrite(query,Number($limitSelect.value))
			const notesString=storage.getItem('notes')
			if (notesString==null) return
			const usersString=storage.getItem('users')
			if (usersString==null) return
			const notes=JSON.parse(notesString)
			const users=JSON.parse(usersString)
			startFetcher(
				storage,
				$notesContainer,$moreContainer,$commandContainer,
				filterPanel,map,
				$limitSelect,$autoLoadCheckbox,$fetchButton,
				query,notes,users
			)
		} catch {}
	}
}
