import {makeElement, makeDiv, makeLabel} from './util/html'

let idCount=0

export default function makeTextButtonInputGroup(...classes: string[]): (labelItems: (string|HTMLElement)[], $input: HTMLInputElement, $button: HTMLElement)=>HTMLDivElement {
	return (labelItems, $input, $button)=>{
		const id='text-button-input-group-input-'+idCount++
		const $label=makeLabel()(...labelItems)
		$label.htmlFor=$input.id=id
		return makeDiv('text-button-input-group',...classes)(
			$label,` `,
			makeElement('span')()($input,` `,$button)
		)
	}
}
