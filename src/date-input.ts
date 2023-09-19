import type {DateQuery} from './query-date'
import {toDateQuery} from './query-date'
import {convertDateToIsoDateString} from './util/date'

export default class DateInput {
	public $input=document.createElement('input')
	public $dateInput=document.createElement('input')
	constructor(public onInput: (value:string)=>void = ()=>{}) {
		this.$input.type='text'
		this.$input.size=20
		this.$dateInput.type='date'
		this.$dateInput.tabIndex=-1
		this.$input.oninput=()=>{
			this.updateValidityAndDateInput()
			this.onInput(this.$input.value)
		}
		this.$dateInput.onchange=()=>{
			this.$input.value=this.$dateInput.value
			this.updateValidity()
			this.onInput(this.$input.value)
		}
	}
	get $elements(): HTMLElement[] {
		return [this.$input,this.$dateInput]
	}
	get value(): string {
		return this.$input.value
	}
	set value(value: string) {
		this.$input.value=value
		this.updateValidityAndDateInput()
	}
	private updateValidityAndDateInput(): void {
		const query=this.updateValidity()
		if (query.dateType=='valid') {
			const date=new Date(query.date*1000)
			this.$dateInput.value=convertDateToIsoDateString(date)
		} else {
			this.$dateInput.value=''
		}
	}
	private updateValidity(): DateQuery {
		const query=toDateQuery(this.$input.value)
		if (query.dateType=='invalid') {
			this.$input.setCustomValidity(query.message)
		} else {
			this.$input.setCustomValidity('')
		}
		return query
	}
}
