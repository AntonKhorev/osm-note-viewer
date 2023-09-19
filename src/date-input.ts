import type {DateQuery} from './query-date'
import {toDateQuery} from './query-date'
import {convertDateToIsoDateString} from './util/date'

export default class DateInput {
	private $timestampInput=document.createElement('input')
	private $dateInput=document.createElement('input')
	constructor(callback: (value:string)=>void) {
		this.$timestampInput.type='text'
		this.$timestampInput.size=20
		this.$dateInput.type='date'
		this.$dateInput.tabIndex=-1
		this.$timestampInput.oninput=()=>{
			this.updateValidityAndDateInput()
			callback(this.$timestampInput.value)
		}
		this.$dateInput.onchange=()=>{
			this.$timestampInput.value=this.$dateInput.value
			this.updateValidity()
			callback(this.$timestampInput.value)
		}
	}
	get $elements(): HTMLElement[] {
		return [this.$timestampInput,this.$dateInput]
	}
	get value(): string {
		return this.$timestampInput.value
	}
	set value(value: string) {
		this.$timestampInput.value=value
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
		const query=toDateQuery(this.$timestampInput.value)
		if (query.dateType=='invalid') {
			this.$timestampInput.setCustomValidity(query.message)
		} else {
			this.$timestampInput.setCustomValidity('')
		}
		return query
	}
}
