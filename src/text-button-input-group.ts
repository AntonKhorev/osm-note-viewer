import {makeElement, makeDiv, makeLabel} from './util/html'

let idCount=0

export default function makeTextButtonInputGroup(...classes: string[]): (labelItems: (string|HTMLElement)[], $input: HTMLInputElement, $button: HTMLElement)=>HTMLDivElement {
	return (labelItems, $input, $button)=>{
		const id='text-button-input-group-input-'+idCount++
		const $label=makeLabel()(...labelItems)
		$label.htmlFor=$input.id=id
		return makeDiv('input-group','text-button',...classes)(
			$label,` `,
			makeElement('span')()($input,` `,$button)
		)
	}
}
