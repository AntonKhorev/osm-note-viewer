// use isNaN(+date) to test for invalid dates

export function getDateFromInputString(inputString: string): Date {
	const [date]=parseDateFromInputString(inputString)
	return date
}

export function convertDateToUrlString(date: Date): string {
	return convertDateToIsoString(date,'','')
}

export function convertDateToReadableString(date: Date): string {
	return convertDateToIsoString(date,'-',':',' ','')
}

export function convertDateToIsoString(date: Date, dateSeparator='-', timeSeparator=':', dateTimeSeparator='T', utcSuffix='Z'): string {
	return (
		convertDateToIsoDateString(date,dateSeparator)+
		dateTimeSeparator+
		convertDateToIsoTimeString(date,timeSeparator)+
		utcSuffix
	)
}

export function convertDateToIsoDateString(date: Date, separator='-'): string {
	return (
		date.getUTCFullYear()+separator+
		pad00(date.getUTCMonth()+1)+separator+
		pad00(date.getUTCDate())
	)
}

export function convertDateToIsoTimeString(date: Date, separator=':'): string {
	return (
		pad00(date.getUTCHours())+separator+
		pad00(date.getUTCMinutes())+separator+
		pad00(date.getUTCSeconds())
	)
}

export function parseDateFromInputString(inputString: string): [date: Date, match: string] {
	let s=inputString.trim()
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

function pad00(n: number): string {
	return ('0'+n).slice(-2)
}
