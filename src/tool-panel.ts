import type NoteViewerStorage from './storage'
import type {Connection} from './net'
import type NoteMap from './map'
import type {Tool} from './tools'
import {toolMakerSequence} from './tools'
import {makeElement, makeDiv, makeLabel} from './util/html'

type ToolWithDetails=[
	tool: Tool,
	$tool: HTMLDetailsElement|null,
	$info: HTMLDetailsElement|null
]

export default class ToolPanel {
	constructor(
		$root: HTMLElement, $toolbar: HTMLElement,
		storage: NoteViewerStorage, cx: Connection,
		map: NoteMap
	) {
		const tools: ToolWithDetails[] = []
		for (const makeTool of toolMakerSequence) {
			const tool=makeTool(storage,cx)
			const storageKey=`tools[${tool.id}]`
			const [$tool,$info]=tool.write($root,map)
			if ($tool) {
				let toolState=storage.getItem(storageKey)
				if (toolState==null) {
					if (tool.id=='interact') {
						toolState='0'
					} else {
						toolState='-1'
					}
					storage.setItem(storageKey,toolState)
				}
				$tool.open=toolState=='1'
				$tool.hidden=toolState=='-1'
				$tool.addEventListener('toggle',()=>{
					storage.setItem(storageKey,$tool.open?'1':'0')
				})
				$toolbar.append($tool)
				if ($info) {
					$toolbar.append($info)
				}
			}
			tools.push([tool,$tool,$info])
		}
		const $settingsDialog=makeSettingsDialog(tools,storage)
		$root.append($settingsDialog)
		const $settingsButton=makeElement('button')('settings')(`⚙️`)
		$settingsButton.title=`Toolbar settings`
		$settingsButton.onclick=()=>{
			$settingsDialog.showModal()
		}
		$toolbar.append($settingsButton)
	}
}

type ToolWithDetailsAndCheckboxes=[
	tool: Tool,
	$tool: HTMLDetailsElement|null,
	$info: HTMLDetailsElement|null,
	$checkbox: HTMLInputElement
]

function makeSettingsDialog(toolsWithDetails: ToolWithDetails[], storage: NoteViewerStorage): HTMLDialogElement {
	const $dialog=makeElement('dialog')('help')()
	const $closeButton=makeElement('button')('close')()
	$closeButton.title=`Close toolbar settings`
	$closeButton.innerHTML=`<svg><use href="#reset" /></svg>`
	const $openAllButton=makeElement('button')('open-all-tools')(`Open all enabled tools`)
	const $closeAllButton=makeElement('button')('close-all-tools')(`Close all enabled tools`)

	$dialog.append(
		$closeButton,
		makeElement('h2')()(`Toolbar settings`),
		makeToolsTable(toolsWithDetails,storage),
		makeDiv('input-group','major')(
			$openAllButton,$closeAllButton
		)
	)
	
	$closeButton.onclick=()=>{
		$dialog.close()
	}
	const makeAllToolsListener=(open:boolean)=>()=>{
		for (const [,$tool] of toolsWithDetails) {
			if (!$tool) continue
			$tool.open=open
		}
	}
	$openAllButton.onclick=makeAllToolsListener(true)
	$closeAllButton.onclick=makeAllToolsListener(false)

	return $dialog
}

function makeToolsTable(toolsWithDetails: ToolWithDetails[], storage: NoteViewerStorage): HTMLTableElement {
	const toolsWithDetailsAndCheckboxes=toolsWithDetails.map((twd):ToolWithDetailsAndCheckboxes=>{
		const [tool]=twd
		const storageKey=`tools[${tool.id}]`
		const toolState=storage.getItem(storageKey)
		const $checkbox=makeElement('input')()()
		$checkbox.type='checkbox'
		$checkbox.checked=Boolean(toolState)&&toolState!='-1'
		return [...twd,$checkbox]
	})
	const toggleTool=(...[tool,$tool,$info,$checkbox]:ToolWithDetailsAndCheckboxes)=>{
		const storageKey=`tools[${tool.id}]`
		if ($checkbox.checked) {
			if ($tool) $tool.hidden=false
			if ($tool) $tool.open=false
			storage.setItem(storageKey,'0')
		} else {
			if ($tool) $tool.hidden=true
			if ($info) $info.open=false
			storage.setItem(storageKey,'-1')
		}
	}
	const $allCheckbox=makeElement('input')()()
	$allCheckbox.type='checkbox'

	const $head=makeElement('thead')()()
	const $body=makeElement('tbody')()()
	{
		const $row=$head.insertRow()
		const $cell=$row.insertCell()
		$cell.colSpan=2
		$cell.append(makeLabel()(
			$allCheckbox,` Show/hide all tools`
		))
	}
	for (const [tool,$tool,$info,$checkbox] of toolsWithDetailsAndCheckboxes) {
		const $row=$body.insertRow()
		const getToolName=():string|HTMLElement=>{
			if ($tool) {
				return tool.name
			} else {
				const $name=makeElement('s')()(tool.name)
				$name.title=`incompatible with current server`
				return $name
			}
		}
		const getToolDescription=():HTMLElement=>{
			if (tool.title==null) return makeElement('span')()()
			return makeElement('small')()(tool.title)
		}
		$checkbox.oninput=()=>{
			toggleTool(tool,$tool,$info,$checkbox)
			updateAllCheckbox()
		}
		$row.insertCell().append(
			makeLabel()($checkbox,` `,getToolName())
		)
		const $description=$row.insertCell()
		$description.classList.add('description')
		$description.append(
			getToolDescription()
		)
	}

	const updateAllCheckbox=()=>{
		let hasChecked=false
		let hasUnchecked=false
		for (const [,,,$checkbox] of toolsWithDetailsAndCheckboxes) {
			if ($checkbox.checked) {
				hasChecked=true
			} else {
				hasUnchecked=true
			}
		}
		$allCheckbox.indeterminate=hasChecked && hasUnchecked
		$allCheckbox.checked=hasChecked && !hasUnchecked
	}
	$allCheckbox.oninput=()=>{
		$allCheckbox.indeterminate=false
		for (const [tool,$tool,$info,$checkbox] of toolsWithDetailsAndCheckboxes) {
			if ($checkbox.checked==$allCheckbox.checked) continue
			$checkbox.checked=$allCheckbox.checked
			toggleTool(tool,$tool,$info,$checkbox)
		}
	}

	updateAllCheckbox()
	return makeElement('table')('tool-settings')($head,$body)
}
