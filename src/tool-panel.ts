import type NoteViewerStorage from './storage'
import type Auth from './auth'
import type NoteMap from './map'
import type {Tool} from './tools'
import {toolMakerSequence} from './tools'
import {makeElement, makeDiv, makeLabel, bubbleCustomEvent} from './html'

export default class ToolPanel {
	constructor(
		$root: HTMLElement, $toolbar: HTMLElement,
		storage: NoteViewerStorage, auth: Auth,
		map: NoteMap
	) {
		const tools: Tool[] = []
		for (const makeTool of toolMakerSequence) {
			const tool=makeTool(auth)
			tool.write($root,$toolbar,storage,map)
			tools.push(tool)
		}
		const $settingsDialog=makeSettingsDialog($toolbar,tools)
		$root.append($settingsDialog)
		const $settingsButton=makeElement('button')('settings')(`⚙️`)
		$settingsButton.title=`Toolbar settings`
		$settingsButton.onclick=()=>{
			$settingsDialog.showModal()
		}
		$toolbar.append($settingsButton)
	}
}

function makeSettingsDialog($toolbar: HTMLElement, tools: Tool[]): HTMLDialogElement {
	const $dialog=makeElement('dialog')('help')()
	const $closeButton=makeElement('button')('close')()
	$closeButton.title=`Close toolbar settings`
	$closeButton.innerHTML=`<svg><use href="#reset" /></svg>`
	$closeButton.onclick=()=>{
		$dialog.close()
	}
	const $openAllButton=makeElement('button')('open-all-tools')(`Open all enabled tools`)
	$openAllButton.onclick=()=>bubbleCustomEvent($toolbar,'osmNoteViewer:toolsToggle',true)
	const $closeAllButton=makeElement('button')('close-all-tools')(`Close all enabled tools`)
	$closeAllButton.onclick=()=>bubbleCustomEvent($toolbar,'osmNoteViewer:toolsToggle',false)
	$dialog.append(
		$closeButton,
		makeElement('h2')()(`Toolbar settings`)
	)
	for (const tool of tools) {
		const getToolName=():HTMLElement=>{
			if (tool.isActiveWithCurrentServer()) {
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
