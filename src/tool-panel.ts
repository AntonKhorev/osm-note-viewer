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
				const toolState=storage.getItem(storageKey)
				$tool.open=toolState=='1'
				$tool.hidden=toolState==null
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
	const toolsWithDetailsAndCheckboxes=toolsWithDetails.map((twd):ToolWithDetailsAndCheckboxes=>{
		const [tool]=twd
		const storageKey=`tools[${tool.id}]`
		const $checkbox=makeElement('input')()()
		$checkbox.type='checkbox'
		$checkbox.checked=storage.getItem(storageKey)!=null
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
			storage.removeItem(storageKey)
		}
	}
	const $dialog=makeElement('dialog')('help')()
	const $closeButton=makeElement('button')('close')()
	$closeButton.title=`Close toolbar settings`
	$closeButton.innerHTML=`<svg><use href="#reset" /></svg>`
	$closeButton.onclick=()=>{
		$dialog.close()
	}
	const makeAllToolsListener=(open:boolean)=>()=>{
		for (const [,$tool] of toolsWithDetailsAndCheckboxes) {
			if (!$tool) continue
			$tool.open=open
		}
	}
	const $openAllButton=makeElement('button')('open-all-tools')(`Open all enabled tools`)
	$openAllButton.onclick=makeAllToolsListener(true)
	const $closeAllButton=makeElement('button')('close-all-tools')(`Close all enabled tools`)
	$closeAllButton.onclick=makeAllToolsListener(false)
	const $allCheckbox=makeElement('input')()()
	$allCheckbox.type='checkbox'
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
	$dialog.append(
		$closeButton,
		makeElement('h2')()(`Toolbar settings`),
		makeDiv('major-input-group','all-tools')(makeLabel()(
			$allCheckbox,` Show/hide all tools`
		))
	)
	for (const [tool,$tool,$info,$checkbox] of toolsWithDetailsAndCheckboxes) {
		const getToolName=():HTMLElement=>{
			if ($tool) {
				const $name=makeElement('span')()(tool.name)
				if (tool.title!=null) $name.title=tool.title
				return $name
			} else {
				const $name=makeElement('s')()(tool.name)
				$name.title=`incompatible with current server`
				return $name
			}
		}
		$checkbox.oninput=()=>{
			toggleTool(tool,$tool,$info,$checkbox)
			updateAllCheckbox()
		}
		$dialog.append(
			makeDiv('regular-input-group')(makeLabel()(
				$checkbox,` `,getToolName()
			))
		)
	}
	updateAllCheckbox()
	$allCheckbox.oninput=()=>{
		$allCheckbox.indeterminate=false
		for (const [tool,$tool,$info,$checkbox] of toolsWithDetailsAndCheckboxes) {
			if ($checkbox.checked==$allCheckbox.checked) continue
			$checkbox.checked=$allCheckbox.checked
			toggleTool(tool,$tool,$info,$checkbox)
		}
	}
	$dialog.append(
		makeDiv('major-input-group')(
			$openAllButton,$closeAllButton
		)
	)
	return $dialog
}
