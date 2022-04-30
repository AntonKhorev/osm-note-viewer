import {LooseParseType} from './loose'
import {makeElement, makeEscapeTag} from './util'

const e=makeEscapeTag(encodeURIComponent)

export default class LooseParserPopup {
	private $popup=document.createElement('ul')
	constructor($container: HTMLElement) {
		this.$popup.classList.add('loose-parser-popup')
		this.$popup.onmouseleave=()=>{
			this.$popup.classList.remove('open')
		}
		$container.append(this.$popup)
	}
	open(x: number, y: number, id: number, type: LooseParseType): void {
		const itemHeight=20
		const itemWidth=80
		this.$popup.style.left=`${x-0.75*itemWidth}px`
		this.$popup.style.top=`${y-2*itemHeight}px`
		this.$popup.innerHTML=''
		const href=(type:string)=>e`https://www.openstreetmap.org/${type}/${id}`
		this.$popup.append(
			makeItem(`#${id}`),
			makeITEM(type??'?',type&&href(type)),
			...['note','changeset','node','way','relation'].map(type=>makeItem(type,href(type)))
		)
		this.$popup.classList.add('open')
	}
}

function makeItem(text: string, href?: string) {
	const $a=makeElement('a')()(text)
	if (href) $a.href=href
	return makeElement('li')()($a)
}

function makeITEM(text: string, href?: string) {
	const $li=makeItem(text,href)
	$li.classList.add('main')
	return $li
}
