// use isNaN(+date) to test for invalid dates

export function getDateFromInputDateTime(inputDateTime: string): Date {
	const [date]=parseDateFromInputDateTime(inputDateTime)
	return date
}

export function parseDateFromInputDateTime(readableDate: string): [date: Date, match: string] {
	let s=readableDate.trim()
	let m=''
	let r=''
	{
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
	function invalid(): [date: Date, match: string] {
		return [new Date(NaN), m]
	}
	function complete(): [date: Date, match: string] {
		const completionTemplate='2000-01-01 00:00:00Z'
		const completedReadableDate=r+completionTemplate.slice(r.length)
		return [new Date(completedReadableDate), m]
	}
}
