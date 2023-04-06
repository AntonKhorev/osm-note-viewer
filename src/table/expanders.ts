import type NoteViewerStorage from '../storage'
import {makeElement} from '../util/html'

type ExpanderStateDescription = [
	value: number,
	isVertical: boolean,
	isInward: boolean,
	isTight: boolean,
	buttonTitle: string,
]
type ExpanderDescription = [
	defaultValue: number,
	states: ExpanderStateDescription[]
]

const expanderDescriptions=new Map<string,ExpanderDescription>([
	['id',[
		1,[
			[-1,false,true,true,`don't show id digits`],
			[0,false,true,false,`show only changing id digits`],
			[1,false,false,false,`show all id digits`],
		]
	]],
	['comments',[
		1,[
			[0,true,true,false,`show only first comment/action`],
			[1,true,false,false,`show all comments/actions`],
		]
	]],
	['date',[
		0,[
			[-1,false,true,true,`hide time of day and year`],
			[0,false,true,false,`hide time of day`],
			[1,false,false,false,`show time of day`],
		]
	]],
	['username',[
		0,[
			[-1,false,true,true,`seriously clip usernames`],
			[0,false,true,false,`clip long usernames`],
			[1,false,false,false,`show full usernames with ids`],
		]
	]],
	['comment-lines',[
		1,[
			[0,false,false,false,`keep comments on one line`],
			[1,true,false,false,`allow line breaks in comments`],
		]
	]],
	['map-link',[
		1,[
			[0,false,true,false,`don't stretch map links`],
			[1,false,false,false,`stretch map links`],
		]
	]],
])

function getCurrentAndNextState(key: string, currentValue: number): [
	currentState: ExpanderStateDescription,
	nextState: ExpanderStateDescription,
] {
	const expanderDescription=expanderDescriptions.get(key)
	if (!expanderDescription) throw new RangeError(`invalid expander key`)
	const [,states]=expanderDescription
	let currentState: ExpanderStateDescription|undefined
	for (const state of states) {
		if (currentState) {
			return [currentState,state]
		}
		const [comparedValue]=state
		if (currentValue==comparedValue) {
			currentState=state
		}
	}
	const [firstState,secondState]=states
	if (currentState) return [currentState,firstState]
	return [firstState,secondState]
}

export default class Expanders {
	values=new Map<string,number>
	constructor(
		private storage: NoteViewerStorage,
		private $table: HTMLTableElement
	) {
		for (const [key,[defaultValue,states]] of expanderDescriptions) {
			const possibleValues=new Set(states.map(([value])=>value))
			const storageKey=`table-expanded[${key}]`
			const storedValue=Number(this.storage.getItem(storageKey))
			const value=possibleValues.has(storedValue)?storedValue:defaultValue
			if (value>0) this.$table.classList.add(`expanded-${key}`)
			if (value<0) this.$table.classList.add(`contracted-${key}`)
			this.values.set(key,value)
		}
	}
	makeButton(key: string, clickListener: (value:number)=>void = ()=>{}): HTMLButtonElement|undefined {
		const storageKey=`table-expanded[${key}]`
		const $button=makeElement('button')('expander')()
		$button.innerHTML=getButtonSvg()
		let hasHover=false
		let inFocusTransition=false
		const updateButton=()=>{
			const nextShape=inFocusTransition||hasHover
			const value=this.values.get(key)
			if (value==null) throw new RangeError(`unset expander value`)
			const [currentState,nextState]=getCurrentAndNextState(key,value)
			const shapeState=nextShape?nextState:currentState
			const [,isVertical,isInward,isTight]=shapeState
			$button.classList.toggle('vertical',isVertical)
			$button.classList.toggle('inward',isInward)
			$button.classList.toggle('tight',isTight)
			;[,,,,$button.title]=nextState
		}
		updateButton()
		$button.onclick=()=>{
			let value=this.values.get(key)
			if (value==null) throw new RangeError(`unset expander value`)
			const [,nextState]=getCurrentAndNextState(key,value)
			;[value]=nextState
			this.values.set(key,value)
			this.$table.classList.toggle(`expanded-${key}`,value>0)
			this.$table.classList.toggle(`contracted-${key}`,value<0)
			this.storage.setItem(storageKey,String(value))
			inFocusTransition=false
			updateButton()
			clickListener(value)
		}
		$button.onpointerenter=()=>{
			hasHover=true
			updateButton()
		}
		$button.onpointerleave=()=>{
			hasHover=false
			updateButton()
		}
		$button.onfocus=()=>{
			inFocusTransition=!hasHover
			updateButton()
		}
		$button.onblur=$button.ontransitionend=()=>{
			inFocusTransition=false
			updateButton()
		}
		return $button
	}
}

function getButtonSvg(): string {
	return `<svg width="15" height="15" viewBox="0 0 15 15">`+
		`<g class="arrow" stroke="currentColor" fill="none">`+
			`<line x1="0.5" x2="14.5" y1="7.5" y2="7.5" />`+
			getArrowEndSvg(``)+
			getArrowEndSvg(` scale(-1 1)`)+
		`</g>`+
	`</svg>`
}

function getArrowEndSvg(extraTransform: string): string {
	return `<g transform="translate(7.5)${extraTransform}">`+
		`<g class="arrowend">`+
			`<path class="arrowhead" d="M-2,4 L+2,7.5 L-2,11" />`+
		`</g>`+
	`</g>`
}
