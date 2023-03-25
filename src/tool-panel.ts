import type NoteViewerStorage from './storage'
import type Auth from './auth'
import type NoteMap from './map'
import type {Tool} from './tools'
import {toolMakerSequence} from './tools'
import {makeElement, makeDiv, makeLabel} from './html'

type ToolWithDetails=[tool: Tool, $tool:HTMLDetailsElement|null, $info: HTMLDetailsElement|null]

export default class ToolPanel {
	constructor(
		$root: HTMLElement, $toolbar: HTMLElement,
		storage: NoteViewerStorage, auth: Auth,
		map: NoteMap
	) {
		const tools: ToolWithDetails[] = []
		for (const makeTool of toolMakerSequence) {
			const tool=makeTool(auth)
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

function makeSettingsDialog(tools: ToolWithDetails[], storage: NoteViewerStorage): HTMLDialogElement {
	const $dialog=makeElement('dialog')('help')()
	const $closeButton=makeElement('button')('close')()
	$closeButton.title=`Close toolbar settings`
	$closeButton.innerHTML=`<svg><use href="#reset" /></svg>`
	$closeButton.onclick=()=>{
		$dialog.close()
	}
	const makeAllToolsListener=(open:boolean)=>()=>{
		for (const [,$tool] of tools) {
			if (!$tool) continue
			$tool.open=open
		}
	}
	const $openAllButton=makeElement('button')('open-all-tools')(`Open all enabled tools`)
	$openAllButton.onclick=makeAllToolsListener(true)
	const $closeAllButton=makeElement('button')('close-all-tools')(`Close all enabled tools`)
	$closeAllButton.onclick=makeAllToolsListener(false)
	$dialog.append(
		$closeButton,
		makeElement('h2')()(`Toolbar settings`)
	)
	for (const [tool,$tool,$info] of tools) {
		const storageKey=`tools[${tool.id}]`
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
		const $checkbox=makeElement('input')()()
		$checkbox.type='checkbox'
		$checkbox.checked=storage.getItem(storageKey)!=null
		$checkbox.oninput=()=>{
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
		$dialog.append(
			makeDiv('regular-input-group')(makeLabel()(
				$checkbox,` `,getToolName()
			))
		)
	}
	$dialog.append(
		makeDiv('major-input-group')(
			$openAllButton,$closeAllButton
		)
	)
	return $dialog
}
