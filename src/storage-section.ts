import type NoteViewerStorage from './storage'
import type NoteViewerDB from './db'
import type {FetchEntry} from './db'
import type ServerList from './server-list'
import ConfirmedButtonListener from './confirmed-button-listener'
import {makeElement, makeDiv, makeLink} from './html'
import {p} from './html-shortcuts'

export default class StorageSection {
	constructor(
		$section: HTMLElement,
		storage: NoteViewerStorage,
		db: NoteViewerDB,
		serverList: ServerList
	) {
		$section.append(
			makeElement('h3')()(`Storage`)
		)
		const $updateFetchesButton=document.createElement('button')
		$updateFetchesButton.textContent=`Update stored fetch list`
		$section.append(makeDiv('major-input')($updateFetchesButton))
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
				insertCell().append('last access')
				function insertCell() {
					const $th=document.createElement('th')
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
				const fetchEntryServer=serverList.getServer(host)
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
				$row.insertCell().append(new Date(fetchEntry.accessTimestamp).toISOString())
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
			$section.append(makeDiv('major-input')($clearButton,$cancelButton,$confirmButton))
		}
	}
}
