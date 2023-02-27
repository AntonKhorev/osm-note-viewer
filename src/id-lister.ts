export default function listNoteIds(inputIds: readonly number[]): string {
	const ids=[...inputIds].sort((a,b)=>a-b)
	if (ids.length==0) return ''
	if (ids.length==1) return 'note '+ids[0]
	let result='notes '
	let first=true
	let rangeStart: number|undefined
	let rangeEnd: number|undefined
	const appendRange=()=>{
		if (rangeStart==null || rangeEnd==null) return
		if (first) {
			first=false
		} else {
			result+=','
		}
		if (rangeEnd==rangeStart) {
			result+=rangeStart
		} else if (rangeEnd==rangeStart+1) {
			result+=rangeStart+','+rangeEnd
		} else {
			result+=rangeStart+'-'+rangeEnd
		}
	}
	for (const id of ids) {
		if (rangeEnd!=null && id==rangeEnd+1) {
			rangeEnd=id
		} else {
			appendRange()
			rangeStart=rangeEnd=id
		}
	}
	appendRange()
	return result
}
