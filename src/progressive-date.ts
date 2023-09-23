type ProgressiveDateItemLevel0 = string | ProgressiveDateItemLevel1[]
type ProgressiveDateItemLevel1 = string | ProgressiveDateItemLevel2[]
type ProgressiveDateItemLevel2 = string

export default function makeProgressiveDate(date: Date, now: Date): ProgressiveDateItemLevel0[] {
	const pad=(n: number): string => ('0'+n).slice(-2)
	const YYYY=String(date.getUTCFullYear())
	const MM_DD=pad(date.getUTCMonth()+1)+'-'+pad(date.getUTCDate())
	const hh_mm=pad(date.getUTCHours())+':'+pad(date.getUTCMinutes())
	const ss=pad(date.getUTCSeconds())
	const diff=Math.abs(now.valueOf()-date.valueOf())
	if (diff<1000*60*60*24) {
		return [YYYY+'-'+MM_DD+' ',[[hh_mm],':'+ss]]
	} else if (diff<1000*60*60*24*365) {
		return [[YYYY+'-',[MM_DD]],' '+hh_mm+':'+ss]
	} else {
		return [[[YYYY],'-'+MM_DD],' '+hh_mm+':'+ss]
	}
}
