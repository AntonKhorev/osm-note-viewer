import type NoteViewerStorage from './storage'
import type NoteViewerDB from './db'
import type {FetchEntry} from './db'
import type {HashServerSelector} from './net'
import ConfirmedButtonListener from './confirmed-button-listener'
import {convertDateToReadableString} from './util/date'
import {makeElement, makeDiv, makeLink} from './util/html'
import {p} from './util/html-shortcuts'

export default class StorageSection {
	constructor(
		$section: HTMLElement,
		storage: NoteViewerStorage,
		db: NoteViewerDB,
		serverSelector: HashServerSelector
	) {
		$section.append(
			makeElement('h2')()(`Storage`)
		)
		const $updateFetchesButton=document.createElement('button')
		$updateFetchesButton.textContent=`Update stored fetch list`
		$section.append(makeDiv('input-group','major')($updateFetchesButton))
		const $fetchesContainer=makeDiv()(p(
			`Click Update button above to see stored fetches.`
		))
		$section.append($fetchesContainer)
		$updateFetchesButton.addEventListener('click',async()=>{
			$updateFetchesButton.disabled=true
			let fetchEntries: FetchEntry[] =[]
			try {
				fetchEntries=await db.listFetches()
			} catch {}
			$updateFetchesButton.disabled=false
			$fetchesContainer.innerHTML=''
			const $table=document.createElement('table')
			{
				const $row=$table.insertRow()
				insertCell().append('fetch')
				insertCell().append('mode')
				insertCell().append('content')
				insertCell(`all timestamps in UTC`).append('last access')
				function insertCell(title?: string) {
					const $th=document.createElement('th')
					if (title) {
						$th.title=title
						$th.classList.add('tipped')
					}
					$row.append($th)
					return $th
				}
			}
			let n=0
			for (const fetchEntry of fetchEntries) {
				const $row=$table.insertRow()
				$row.insertCell().append(makeLink(`[${++n}]`,'#'+fetchEntry.queryString))
				const searchParams=new URLSearchParams(fetchEntry.queryString)
				$row.insertCell().append(searchParams.get('mode')??'(outdated/invalid)')
				const $userCell=$row.insertCell()
				const username=searchParams.get('display_name')
				const ids=searchParams.get('ids')
				const host=searchParams.get('host')
				const fetchEntryServer=serverSelector.getServerForHostHashValue(host)
				if (username) {
					if (fetchEntryServer) {
						const href=fetchEntryServer.web.getUrl(`user/`+encodeURIComponent(username))
						$userCell.append(`user `,makeLink(username,href))
					} else {
						$userCell.append(`user ${username}`)
					}
				} else if (ids) {
					const match=ids.match(/\d+/)
					if (match) {
						const [id]=match
						if (fetchEntryServer) {
							const href=fetchEntryServer.web.getUrl(`note/`+encodeURIComponent(id))
							$userCell.append(`note `,makeLink(id,href),`, ...`)
						} else {
							$userCell.append(`note ${id}, ...`)
						}
					}
				}
				$row.insertCell().append(
					convertDateToReadableString(
						new Date(fetchEntry.accessTimestamp)
					)
				)
				const $deleteButton=document.createElement('button')
				$deleteButton.textContent=`Delete`
				$deleteButton.addEventListener('click',async()=>{
					$deleteButton.disabled=true
					await db.deleteFetch(fetchEntry)
					$updateFetchesButton.click()
				})
				$row.insertCell().append($deleteButton)
			}
			$fetchesContainer.append($table)
		})
		{
			const $clearButton=makeElement('button')()(`Clear settings`)
			const $cancelButton=makeElement('button')()(`Cancel clear settings`)
			const $confirmButton=makeElement('button')()(`Confirm clear settings`)
			new ConfirmedButtonListener(
				$clearButton,$cancelButton,$confirmButton,
				async()=>storage.clear()
			)
			$section.append(makeDiv('input-group','major')($clearButton,$cancelButton,$confirmButton))
		}
	}
}
