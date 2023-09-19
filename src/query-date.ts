import {convertDateToIsoString, parseDateFromInputString} from './util/date'

export interface ValidDateQuery {
	dateType: 'valid'
	date: number
}

export interface InvalidDateQuery {
	dateType: 'invalid'
	message: string
}

export interface EmptyDateQuery {
	dateType: 'empty'
}

export type DateQuery = ValidDateQuery | InvalidDateQuery | EmptyDateQuery

export function toReadableDate(date: number|undefined): string {
	return toShortOrFullReadableDate(date,true)
}

export function toShortReadableDate(date: number|undefined): string {
	return toShortOrFullReadableDate(date,false)
}

function toShortOrFullReadableDate(date: number|undefined, full: boolean): string {
	if (date==null) return ''
	const pad=(n: number): string => ('0'+n).slice(-2)
	const dateObject=new Date(date*1000)
	let dateString=''
	switch (true) {
	case full || dateObject.getUTCSeconds()!=0:
		dateString=':'+pad(dateObject.getUTCSeconds())
	case dateObject.getUTCMinutes()!=0 || dateObject.getUTCHours()!=0:
		dateString=' '+pad(dateObject.getUTCHours())+':'+pad(dateObject.getUTCMinutes())+dateString
	case dateObject.getUTCDate()!=1 || dateObject.getUTCMonth()!=0:
		dateString='-'+pad(dateObject.getUTCMonth()+1)+'-'+pad(dateObject.getUTCDate())+dateString
	default:
		dateString=dateObject.getUTCFullYear()+dateString
	}
	return dateString
}

export function toUrlDate(date: number, dateSeparator='', timeSeparator=''): string {
	const dateObject=new Date(date*1000)
	return convertDateToIsoString(dateObject,dateSeparator,timeSeparator)
}

export function toDateQuery(readableDate: string): DateQuery {
	const s=readableDate.trim()
	if (s=='') {
		return {
			dateType: 'empty'
		}
	}
	const [date,match]=parseDateFromInputString(s)
	if (isNaN(+date)) {
		let message=`invalid date string`
		if (match!='') message+=` after ${match}`
		return {
			dateType: 'invalid',
			message
		}
	}
	return {
		dateType: 'valid',
		date: date.valueOf()/1000
	}
}
