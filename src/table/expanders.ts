import type NoteViewerStorage from '../storage'
import {makeElement} from '../html'

type ExpanderDescription = [
	defaultValue:boolean,
	expandButtonClass:string, collapseButtonClass:string,
	expandTitle:string, collapseTitle:string
]

const expanderDescriptions=new Map<string,ExpanderDescription>([
	['id',[
		true,
		'hor-out','hor-in',
		`show all id digits`,`show only changing id digits`
	]],
	['date',[
		false,
		'hor-out','hor-in',
		`show time of day`,`hide time of day`
	]],
	['username',[
		false,
		'hor-out','hor-in',
		`show full usernames with ids`,`clip long usernames`
	]],
	['comments',[
		true,
		'ver-out','ver-in',
		`show all comments/actions`,`show only first comment/action`
	]],
	['comment-lines',[
		true,
		'ver-out','hor-out',
		`allow line breaks in comments`,`keep comments on one line`
	]]
])

export default class Expanders {
	constructor(
		private storage: NoteViewerStorage,
		private $table: HTMLTableElement
	) {
		for (const [key,[defaultValue]] of expanderDescriptions) {
			const tableClass=`expanded-${key}`
			const storageKey=`table-expanded[${key}]`
			const storedValue=this.storage.getItem(storageKey)
			let value=defaultValue
			if (storedValue=='0') value=false
			if (storedValue=='1') value=true
			if (value) this.$table.classList.add(tableClass)
		}
	}
	makeButton(key: string, clickListener: (isExpanded:boolean)=>void = ()=>{}): HTMLButtonElement|undefined {
		const expanderDescription=expanderDescriptions.get(key)
		if (!expanderDescription) return
		const [,
			expandButtonClass, collapseButtonClass,
			expandTitle, collapseTitle
		]=expanderDescription
		const $button=makeElement('button')('expander')()
		$button.innerHTML=`<svg><use href="#table-expander" /></svg>`
		const update=(value:boolean)=>{
			$button.classList.toggle(expandButtonClass,!value)
			$button.classList.toggle(collapseButtonClass,value)
			$button.title=value?collapseTitle:expandTitle
		}
		const tableClass=`expanded-${key}`
		const storageKey=`table-expanded[${key}]`
		update(this.$table.classList.contains(tableClass))
		$button.onclick=()=>{
			const isExpanded=this.$table.classList.toggle(tableClass)
			this.storage.setItem(storageKey,isExpanded?'1':'0')
			update(isExpanded)
			clickListener(isExpanded)
		}
		return $button
	}
}
