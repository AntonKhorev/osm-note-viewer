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

export function toReadableDate(date: number | undefined): string {
	if (date==null) return ''
	const pad=(n: number): string => ('0'+n).slice(-2)
	const dateObject=new Date(date*1000)
	const dateString=
		dateObject.getUTCFullYear()+
		'-'+
		pad(dateObject.getUTCMonth()+1)+
		'-'+
		pad(dateObject.getUTCDate())+
		' '+
		pad(dateObject.getUTCHours())+
		':'+
		pad(dateObject.getUTCMinutes())+
		':'+
		pad(dateObject.getUTCSeconds())
	return dateString
}

export function toUrlDate(date: number): string {
	const pad=(n: number): string => ('0'+n).slice(-2)
	const dateObject=new Date(date*1000)
	const dateString=
		dateObject.getUTCFullYear()+
		pad(dateObject.getUTCMonth()+1)+
		pad(dateObject.getUTCDate())+
		'T'+
		pad(dateObject.getUTCHours())+
		pad(dateObject.getUTCMinutes())+
		pad(dateObject.getUTCSeconds())+
		'Z'
	return dateString
}

export function toDateQuery(readableDate: string): DateQuery {
	let s=readableDate.trim()
	let m=''
	let r=''
	{
		if (s=='') return empty()
		const match=s.match(/^((\d\d\d\d)-?)(.*)/)
		if (!match) return invalid()
		next(match)
	}{
		if (s=='') return complete()
		const match=s.match(/^((\d\d)-?)(.*)/)
		if (!match) return invalid()
		r+='-'
		next(match)
	}{
		if (s=='') return complete()
		const match=s.match(/^((\d\d)[T ]?)(.*)/)
		if (!match) return invalid()
		r+='-'
		next(match)
	}{
		if (s=='') return complete()
		const match=s.match(/^((\d\d):?)(.*)/)
		if (!match) return invalid()
		r+=' '
		next(match)
	}{
		if (s=='') return complete()
		const match=s.match(/^((\d\d):?)(.*)/)
		if (!match) return invalid()
		r+=':'
		next(match)
	}{
		if (s=='') return complete()
		const match=s.match(/^((\d\d)Z?)$/)
		if (!match) return invalid()
		r+=':'
		next(match)
	}
	return complete()
	function next(match: RegExpMatchArray): void {
		m+=match[1]
		r+=match[2]
		s=match[3]
	}
	function empty(): EmptyDateQuery {
		return {
			dateType: 'empty'
		}
	}
	function invalid(): InvalidDateQuery {
		let message=`invalid date string`
		if (m!='') message+=` after ${m}`
		return {
			dateType: 'invalid',
			message
		}
	}
	function complete(): ValidDateQuery {
		const completionTemplate='2000-01-01 00:00:00Z'
		const completedReadableDate=r+completionTemplate.slice(r.length)
		return {
			dateType: 'valid',
			date: Date.parse(completedReadableDate)/1000
		}
	}
}
