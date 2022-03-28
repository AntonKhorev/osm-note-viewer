import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import {NoteMap} from './map'
import NoteFilterPanel from './filter-panel'
import ExtrasPanel from './extras-panel'
import {NoteQuery, makeNoteQueryFromInputValues} from './query'
import {toUserQuery} from './query-user'
import {toReadableDate, toDateQuery} from './query-date'
import {startFetcher} from './fetch'

export default class NoteFetchPanel {
	constructor(
		storage: NoteViewerStorage, db: NoteViewerDB,
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
		const $textInput=document.createElement('input')
		const $fromInput=document.createElement('input')
		const $toInput=document.createElement('input')
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
				if (partialQuery.display_name) {
					$userInput.value=partialQuery.display_name
				} else if (partialQuery.user) {
					$userInput.value='#'+partialQuery.user
				}
				const $div=document.createElement('div')
				$div.classList.add('major-input')
				const $label=document.createElement('label')
				$label.append(`OSM username, URL or #id: `,$userInput)
				$div.append($label)
				$fieldset.append($div)
			}{
				$textInput.type='text'
				$textInput.name='user'
				if (partialQuery.q) $textInput.value=partialQuery.q
				const $div=document.createElement('div')
				$div.classList.add('major-input')
				const $label=document.createElement('label')
				$label.append(`Comment text search query: `,$textInput)
				$div.append($label)
				$fieldset.append($div)
			}{
				$fromInput.type='text'
				$fromInput.size=20
				$fromInput.name='from'
				$fromInput.value=toReadableDate(partialQuery.from)
				const $fromLabel=document.createElement('label')
				$fromLabel.append(`from `,$fromInput)
				$toInput.type='text'
				$toInput.size=20
				$toInput.name='to'
				$toInput.value=toReadableDate(partialQuery.to)
				const $toLabel=document.createElement('label')
				$toLabel.append(`to `,$toInput)
				const $div=document.createElement('div')
				$div.append(`Date range: `,$fromLabel,` `,$toLabel)
				$fieldset.append($div)
			}{
				const $div=document.createElement('div')
				$statusSelect.append(
					new Option(`both open and closed`,'-1'),
					new Option(`open and recently closed`,'7'),
					new Option(`only open`,'0'),
				)
				if (partialQuery.closed!=null) $statusSelect.value=String(partialQuery.closed)
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
					span(`Fetch matching `,$statusSelect,` notes`),` `,
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
			const userQuery=toUserQuery($userInput.value)
			if (userQuery.userType=='invalid') {
				$userInput.setCustomValidity(userQuery.message)
			} else {
				$userInput.setCustomValidity('')
			}
		})
		for (const $input of [$fromInput,$toInput]) $input.addEventListener('input',()=>{
			const query=toDateQuery($input.value)
			if (query.dateType=='invalid') {
				$input.setCustomValidity(query.message)
			} else {
				$input.setCustomValidity('')
			}
		})
		$form.addEventListener('submit',(ev)=>{
			ev.preventDefault()
			const query: NoteQuery | undefined = makeNoteQueryFromInputValues(
				$userInput.value,$textInput.value,$fromInput.value,$toInput.value,
				$statusSelect.value,$sortSelect.value,$orderSelect.value
			)
			if (!query) return
			extrasPanel.rewrite(query,Number($limitSelect.value))
			startFetcher(
				storage,db,
				$notesContainer,$moreContainer,$commandContainer,
				filterPanel,map,
				$limitSelect,$autoLoadCheckbox,$fetchButton,
				query,
				true
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
			startFetcher(
				storage,db,
				$notesContainer,$moreContainer,$commandContainer,
				filterPanel,map,
				$limitSelect,$autoLoadCheckbox,$fetchButton,
				query,
				false
			)
		} catch {}
	}
}
