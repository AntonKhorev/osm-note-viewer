import {Tool, ToolElements} from './base'
import CommentWriter from '../comment-writer'
import {makeElement, makeLink} from '../html'
import {p,ul,li} from '../html-shortcuts'

export class ParseTool extends Tool {
	id='parse'
	name=`Parse links`
	title=`Extract interactive links from plaintext`
	getInfo() {return[p(
		`Parse text as if it's a note comment and get its first active element. If such element exists, it's displayed as a link after →. `,
		`Currently detected active elements are: `,
	),ul(
		li(`links to images made in `,makeLink(`StreetComplete`,`https://wiki.openstreetmap.org/wiki/StreetComplete`)),
		li(`links to OSM notes (clicking the output link is not yet implemented)`),
		li(`links to OSM changesets`),
		li(`links to OSM elements`),
		li(`ISO-formatted timestamps`)
	),p(
		`May be useful for displaying an arbitrary OSM element in the map view. Paste the element URL and click the output link.`
	)]}
	getTool(): ToolElements {
		const commentWriter=new CommentWriter(this.auth.server)
		const $input=document.createElement('input')
		$input.type='text'
		$input.size=50
		$input.classList.add('complicated')
		const $parseButton=document.createElement('button')
		$parseButton.type='submit'
		$parseButton.textContent='Parse'
		const $clearButton=document.createElement('button')
		$clearButton.type='reset'
		$clearButton.textContent='Clear'
		const $output=document.createElement('code')
		$output.append(getFirstActiveElement([]))
		const $form=makeElement('form')()($input,` `,$parseButton,` `,$clearButton)
		$form.onsubmit=(ev)=>{
			ev.preventDefault()
			const [elements]=commentWriter.makeCommentElements($input.value)
			$output.replaceChildren(getFirstActiveElement(elements))
		}
		$form.onreset=()=>{
			$output.replaceChildren(getFirstActiveElement([]))
		}
		return [$form,` → `,$output]
		function getFirstActiveElement(elements: Array<string|HTMLAnchorElement|HTMLTimeElement>): string|HTMLElement {
			for (const element of elements) {
				if (element instanceof HTMLAnchorElement) {
					element.textContent=`link`
					return element
				} else if (element instanceof HTMLTimeElement) {
					element.textContent=`date`
					return element
				}
			}
			return `none`
		}
	}
}
