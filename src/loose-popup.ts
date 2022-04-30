import {LooseParseType} from './loose'
import {makeElement, makeEscapeTag} from './util'

const e=makeEscapeTag(encodeURIComponent)
const makeItem=makeElement('li')()
const makeITEM=makeElement('li')('main')

export default class LooseParserPopup {
	private $popup=document.createElement('ul')
	constructor($container: HTMLElement, private installClickListener: ($a:HTMLAnchorElement)=>void) {
		this.$popup.classList.add('loose-parser-popup')
		this.$popup.onmouseleave=()=>{
			this.$popup.classList.remove('open')
			this.$popup.innerHTML=''
		}
		$container.append(this.$popup)
	}
	open(x: number, y: number, id: number, type: LooseParseType): void {
		const itemHeight=20
		const itemWidth=80
		this.$popup.style.left=`${x-0.75*itemWidth}px`
		this.$popup.style.top=`${y-2*itemHeight}px`
		this.$popup.innerHTML=''
		this.$popup.append(makeItem(makeElement('a')()(`#${id}`)))
		this.$popup.append(makeITEM(this.makeLink(id,type)))
		const types: LooseParseType[] = ['note','changeset','node','way','relation']
		for (const type of types) {
			this.$popup.append(makeItem(this.makeLink(id,type)))
		}
		this.$popup.classList.add('open')
	}
	private makeLink(id: number, type: LooseParseType): HTMLAnchorElement {
		if (type==null) return makeElement('a')()('?')
		const $a=makeElement('a')()(type)
		$a.href=e`https://www.openstreetmap.org/${type}/${id}`
		if (type=='note') {
			$a.classList.add('other-note')
			$a.dataset.noteId=String(id)
		} else if (type=='changeset') {
			$a.dataset.changesetId=String(id)
		} else {
			$a.dataset.elementType=type
			$a.dataset.elementId=String(id)
		}
		this.installClickListener($a)
		return $a
	}
}
