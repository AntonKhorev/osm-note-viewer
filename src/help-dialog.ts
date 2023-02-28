import {makeElement, makeDiv} from './html'
import {kbd} from './html-shortcuts'

export default function makeHelpDialog(closeButtonLabel: string, content: (string|HTMLElement)[]): HTMLDialogElement {
	const $helpDialog=makeElement('dialog')('help')()
	const $closeButton=makeElement('button')()(closeButtonLabel)
	$closeButton.onclick=()=>{
		$helpDialog.close()
	}
	$helpDialog.append(
		...content,
		makeDiv('major-input')($closeButton),
		makeDiv('notice')(`Press `,kbd(`F1`),` again to access the default browser help; press `,kbd(`Esc`),` to close this dialog.`)
	)
	return $helpDialog
}
