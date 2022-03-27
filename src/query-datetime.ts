export interface ValidDateTimeQuery {
	dateTimeType: 'valid'
	dateTime: string
}

export interface InvalidDateTimeQuery {
	dateTimeType: 'invalid'
	message: string
}

export interface EmptyDateTimeQuery {
	dateTimeType: 'empty'
}

export type DateTimeQuery = ValidDateTimeQuery | InvalidDateTimeQuery | EmptyDateTimeQuery

export function toReadableDateTime(queryDateTime: string | undefined): string {
	if (queryDateTime==null) return ''
	const match=queryDateTime.match(/^(\d\d\d\d)-?(\d\d)-?(\d\d)[T ](\d\d):?(\d\d):?(\d\d)Z?$/)
	if (!match) return ''
	const [,Y,M,D,h,m,s]=match
	return `${Y}-${M}-${D} ${h}:${m}:${s}`
}

export function toDateTimeQuery(readableDateTime: string): DateTimeQuery {
	let s=readableDateTime.trim()
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
		next(match)
	}{
		if (s=='') return complete()
		const match=s.match(/^((\d\d)[T ]?)(.*)/)
		if (!match) return invalid()
		next(match)
	}{
		if (s=='') return complete()
		const match=s.match(/^((\d\d):?)(.*)/)
		if (!match) return invalid()
		r+='T'
		next(match)
	}{
		if (s=='') return complete()
		const match=s.match(/^((\d\d):?)(.*)/)
		if (!match) return invalid()
		next(match)
	}{
		if (s=='') return complete()
		const match=s.match(/^((\d\d)Z?)$/)
		if (!match) return invalid()
		next(match)
	}
	return complete()
	function next(match: RegExpMatchArray): void {
		m+=match[1]
		r+=match[2]
		s=match[3]
	}
	function empty(): EmptyDateTimeQuery {
		return {
			dateTimeType: 'empty'
		}
	}
	function invalid(): InvalidDateTimeQuery {
		let message=`invalid date string`
		if (m!='') message+=` after ${m}`
		return {
			dateTimeType: 'invalid',
			message
		}
	}
	function complete(): ValidDateTimeQuery {
		const completionTemplate='20000101T000000Z'
		return {
			dateTimeType: 'valid',
			dateTime: r+completionTemplate.slice(r.length)
		}
	}
}
