export default function makeProgressiveDate(date: Date, now: Date): [text: string, level: number][] {
	const pad=(n: number): string => ('0'+n).slice(-2)
	const YYYY=String(date.getUTCFullYear())
	const MM_DD=pad(date.getUTCMonth()+1)+'-'+pad(date.getUTCDate())
	const hh_mm=pad(date.getUTCHours())+':'+pad(date.getUTCMinutes())
	const ss=pad(date.getUTCSeconds())
	const diff=Math.abs(now.valueOf()-date.valueOf())
	if (diff<1000*60*60*24) {
		return [
			[YYYY+'-'+MM_DD+' ',2],
			[hh_mm,0],
			[':'+ss,1],
		]
	} else if (diff<1000*60*60*24*365) {
		return [
			[YYYY+'-',1],
			[MM_DD,0],
			[' '+hh_mm+':'+ss,2],
		]
	} else {
		return [
			[YYYY,0],
			['-'+MM_DD,1],
			[' '+hh_mm+':'+ss,2],
		]
	}
}
