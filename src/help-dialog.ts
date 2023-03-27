import {makeElement, makeDiv} from './util/html'
import {kbd} from './util/html-shortcuts'

export default function makeHelpDialog(closeButtonLabel: string, content: (string|HTMLElement)[]): HTMLDialogElement {
	const $helpDialog=makeElement('dialog')('help')()
	const $closeButton=makeElement('button')('close')()
	$closeButton.title=closeButtonLabel
	$closeButton.innerHTML=`<svg><use href="#reset" /></svg>`
	$closeButton.onclick=()=>{
		$helpDialog.close()
	}
	$helpDialog.append(
		$closeButton,
		...content,
		makeDiv('notice')(`Press `,kbd(`F1`),` again to access the default browser help; press `,kbd(`Esc`),` to close this dialog.`)
	)
	return $helpDialog
}
