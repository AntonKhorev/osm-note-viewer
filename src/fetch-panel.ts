import NoteViewerStorage from './storage'
import NoteViewerDB from './db'
import {NoteMap} from './map'
import NoteFilterPanel from './filter-panel'
import ExtrasPanel from './extras-panel'
import CommandPanel from './command-panel'
import {NoteQuery, makeNoteSearchQueryFromValues, makeNoteBboxQueryFromValues,makeNoteQueryFromHash, makeNoteQueryString} from './query'
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
		const moreButtonIntersectionObservers: IntersectionObserver[] = []
		const searchDialog=new NoteSearchFetchDialog()
		searchDialog.write($container,query=>{
			modifyHistory(query,true)
			runStartFetcher(query,true)
		})
		const bboxDialog=new NoteBboxFetchDialog()
		bboxDialog.write($container,query=>{
			modifyHistory(query,true)
			runStartFetcher(query,true)
		})
		window.addEventListener('hashchange',()=>{
			const query=makeNoteQueryFromHash(location.hash)
			openQueryDialog(query,false)
			modifyHistory(query,false) // in case location was edited manually
			populateInputs(query)
			runStartFetcher(query,false)
		})
		const query=makeNoteQueryFromHash(location.hash)
		openQueryDialog(query,true)
		modifyHistory(query,false)
		populateInputs(query)
		runStartFetcher(query,false)
		function openQueryDialog(query: NoteQuery | undefined, initial: boolean): void {
			if (!query) {
				if (initial) searchDialog.open()
			} else if (query.mode=='search') {
				searchDialog.open()
			} else if (query.mode=='bbox') {
				bboxDialog.open()
			}
		}
		function populateInputs(query: NoteQuery | undefined): void {
			if (!query || query.mode=='search') {
				if (query?.display_name) {
					searchDialog.$userInput.value=query.display_name
				} else if (query?.user) {
					searchDialog.$userInput.value='#'+query.user
				} else {
					searchDialog.$userInput.value=''
				}
				searchDialog.$textInput.value=query?.q ?? ''
				searchDialog.$fromInput.value=toReadableDate(query?.from)
				searchDialog.$toInput.value=toReadableDate(query?.to)
				searchDialog.$statusSelect.value=query ? String(query.closed) : '-1'
				searchDialog.$sortSelect.value=query?.sort ?? 'created_at'
				searchDialog.$orderSelect.value=query?.order ?? 'newest'
			}
			if (!query || query.mode=='bbox') {
				bboxDialog.$bboxInput.value=query?.bbox ?? ''
				bboxDialog.$statusSelect.value=query ? String(query.closed) : '-1'
			}
		}
		function resetNoteDependents() {
			while (moreButtonIntersectionObservers.length>0) moreButtonIntersectionObservers.pop()?.disconnect()
			map.clearNotes()
			$notesContainer.innerHTML=``
			$commandContainer.innerHTML=``
		}
		function runStartFetcher(query: NoteQuery | undefined, clearStore: boolean): void {
			resetNoteDependents()
			if (query?.mode=='search') {
				extrasPanel.rewrite(query,Number(searchDialog.$limitSelect.value))
			} else {
				extrasPanel.rewrite()
			}
			if (query?.mode=='search') {
				const commandPanel=new CommandPanel($commandContainer,map,storage)
				startFetcher(
					db,
					$notesContainer,$moreContainer,
					filterPanel,commandPanel,map,
					searchDialog.$limitSelect,searchDialog.$autoLoadCheckbox,searchDialog.$fetchButton,
					moreButtonIntersectionObservers,
					query,
					clearStore
				)
			} else if (query?.mode=='bbox') {
				console.log('TODO bbox query',query)
			}
		}
	}
}

abstract class NoteFetchDialog {
	abstract title: string
	$details=document.createElement('details')
	$fetchButton=document.createElement('button')
	write($container: HTMLElement, submitQuery: (query: NoteQuery) => void) {
		const $summary=document.createElement('summary')
		$summary.textContent=this.title
		const $form=document.createElement('form')
		$form.append(
			this.makeScopeAndOrderFieldset(),
			this.makeDownloadModeFieldset(),
			this.makeFetchButtonDiv()
		)
		$form.addEventListener('submit',(ev)=>{
			ev.preventDefault()
			const query=this.constructQuery()
			if (!query) return
			submitQuery(query)
		})
		this.$details.addEventListener('toggle',()=>{ // keep only one dialog open
			if (!this.$details.open) return
			for (const $otherDetails of $container.querySelectorAll('details')) {
				if ($otherDetails==this.$details) continue
				if (!$otherDetails.open) continue
				$otherDetails.open=false
			}
		})
		this.$details.append($summary,$form)
		$container.append(this.$details)
	}
	open(): void {
		this.$details.open=true
	}
	private makeScopeAndOrderFieldset(): HTMLFieldSetElement {
		const $fieldset=document.createElement('fieldset')
		const $legend=document.createElement('legend')
		$legend.textContent=`Scope and order`
		$fieldset.append($legend)
		this.writeScopeAndOrderFieldset($fieldset)
		return $fieldset
	}
	private makeDownloadModeFieldset(): HTMLFieldSetElement {
		const $fieldset=document.createElement('fieldset')
		// TODO (re)store input values
		const $legend=document.createElement('legend')
		$legend.textContent=`Download mode (can change anytime)`
		$fieldset.append($legend)
		this.writeDownloadModeFieldset($fieldset)
		return $fieldset
	}
	private makeFetchButtonDiv(): HTMLDivElement {
		this.$fetchButton.textContent=`Fetch notes`
		this.$fetchButton.type='submit'
		const $div=document.createElement('div')
		$div.classList.add('major-input')
		$div.append(this.$fetchButton)
		return $div
	}
	protected abstract writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void
	protected abstract writeDownloadModeFieldset($fieldset: HTMLFieldSetElement): void
	protected abstract addEventListeners(): void
	protected abstract constructQuery(): NoteQuery | undefined
}

class NoteSearchFetchDialog extends NoteFetchDialog {
	title=`Search notes for user / text / date range`
	$userInput=document.createElement('input')
	$textInput=document.createElement('input')
	$fromInput=document.createElement('input')
	$toInput=document.createElement('input')
	$statusSelect=document.createElement('select')
	$sortSelect=document.createElement('select')
	$orderSelect=document.createElement('select')
	$limitSelect=document.createElement('select')
	$autoLoadCheckbox=document.createElement('input')
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void {
		{
			this.$userInput.type='text'
			this.$userInput.name='user'
			const $div=document.createElement('div')
			$div.classList.add('major-input')
			const $label=document.createElement('label')
			$label.append(`OSM username, URL or #id: `,this.$userInput)
			$div.append($label)
			$fieldset.append($div)
		}{
			this.$textInput.type='text'
			this.$textInput.name='text'
			const $div=document.createElement('div')
			$div.classList.add('major-input')
			const $label=document.createElement('label')
			$label.append(`Comment text search query: `,this.$textInput)
			$div.append($label)
			$fieldset.append($div)
		}{
			this.$fromInput.type='text'
			this.$fromInput.size=20
			this.$fromInput.name='from'
			const $fromLabel=document.createElement('label')
			$fromLabel.append(`from `,this.$fromInput)
			this.$toInput.type='text'
			this.$toInput.size=20
			this.$toInput.name='to'
			const $toLabel=document.createElement('label')
			$toLabel.append(`to `,this.$toInput)
			const $div=document.createElement('div')
			$div.append(`Date range: `,$fromLabel,` `,$toLabel)
			$fieldset.append($div)
		}{
			const $div=document.createElement('div')
			this.$statusSelect.append(
				new Option(`both open and closed`,'-1'),
				new Option(`open and recently closed`,'7'),
				new Option(`only open`,'0'),
			)
			this.$sortSelect.append(
				new Option(`creation`,'created_at'),
				new Option(`last update`,'updated_at')
			)
			this.$orderSelect.append(
				new Option('newest'),
				new Option('oldest')
			)
			$div.append(
				span(`Fetch matching `,this.$statusSelect,` notes`),` `,
				span(`sorted by `,this.$sortSelect,` date`),`, `,
				span(this.$orderSelect,` first`)
			)
			$fieldset.append($div)
			function span(...items: Array<string|HTMLElement>): HTMLSpanElement {
				const $span=document.createElement('span')
				$span.append(...items)
				return $span
			}
		}
	}
	protected writeDownloadModeFieldset($fieldset: HTMLFieldSetElement): void {
		{
			const $div=document.createElement('div')
			this.$limitSelect.append(
				new Option('20'),
				new Option('100'),
				new Option('500'),
				new Option('2500')
			)
			$div.append(
				`Download these in batches of `,this.$limitSelect,` notes`
			)
			$fieldset.append($div)
		}{
			this.$autoLoadCheckbox.type='checkbox'
			this.$autoLoadCheckbox.checked=true
			const $div=document.createElement('div')
			const $label=document.createElement('label')
			$label.append(this.$autoLoadCheckbox,` Automatically load more notes when scrolled to the end of the table`)
			$div.append($label)
			$fieldset.append($div)
		}
	}
	protected addEventListeners(): void {
		this.$userInput.addEventListener('input',()=>{
			const userQuery=toUserQuery(this.$userInput.value)
			if (userQuery.userType=='invalid') {
				this.$userInput.setCustomValidity(userQuery.message)
			} else {
				this.$userInput.setCustomValidity('')
			}
		})
		for (const $input of [this.$fromInput,this.$toInput]) $input.addEventListener('input',()=>{
			const query=toDateQuery($input.value)
			if (query.dateType=='invalid') {
				$input.setCustomValidity(query.message)
			} else {
				$input.setCustomValidity('')
			}
		})
	}
	protected constructQuery(): NoteQuery | undefined {
		return makeNoteSearchQueryFromValues(
			this.$userInput.value,this.$textInput.value,this.$fromInput.value,this.$toInput.value,
			this.$statusSelect.value,this.$sortSelect.value,this.$orderSelect.value
		)
	}
}

class NoteBboxFetchDialog extends NoteFetchDialog {
	title=`Get notes inside small rectangular area`
	$bboxInput=document.createElement('input')
	$statusSelect=document.createElement('select')
	$limitSelect=document.createElement('select')
	protected writeScopeAndOrderFieldset($fieldset: HTMLFieldSetElement): void {
		{
			this.$bboxInput.type='text'
			this.$bboxInput.name='bbox'
			const $div=document.createElement('div')
			$div.classList.add('major-input')
			const $label=document.createElement('label')
			$label.append(`Bounding box (left,bottom,right,top): `,this.$bboxInput)
			$div.append($label)
			$fieldset.append($div)
		}{
			const $div=document.createElement('div')
			this.$statusSelect.append(
				new Option(`both open and closed`,'-1'),
				new Option(`open and recently closed`,'7'),
				new Option(`only open`,'0'),
			)
			$div.append(
				span(`Fetch matching `,this.$statusSelect,` notes`),` `,
				span(`sorted by last update date`),`, `,
				span(`newest first`)
			)
			$fieldset.append($div)
			function span(...items: Array<string|HTMLElement>): HTMLSpanElement {
				const $span=document.createElement('span')
				$span.append(...items)
				return $span
			}
		}
	}
	protected writeDownloadModeFieldset($fieldset: HTMLFieldSetElement): void {
		{
			const $div=document.createElement('div')
			this.$limitSelect.append(
				new Option('20'),
				new Option('100'),
				new Option('500'),
				new Option('2500')
			)
			$div.append(
				`Download at most `,this.$limitSelect,` notes`
			)
			$fieldset.append($div)
		}
	}
	protected addEventListeners(): void {
		// TODO add bbox validator
	}
	protected constructQuery(): NoteQuery | undefined {
		return makeNoteBboxQueryFromValues(
			this.$bboxInput.value,this.$statusSelect.value
		)
	}
}

function modifyHistory(query: NoteQuery | undefined, push: boolean): void {
	const canonicalQueryHash = query ? '#'+makeNoteQueryString(query) : ''
	if (canonicalQueryHash!=location.hash) {
		const url=canonicalQueryHash||location.pathname+location.search
		if (push) {
			history.pushState(null,'',url)
		} else {
			history.replaceState(null,'',url)
		}
	}
}
