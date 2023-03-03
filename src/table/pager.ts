export default function getNextPageIndex(
	$scrollingPart: Element,
	$es: Element[],
	fromIndex: number,
	d: number,
	indexBound: number,
	checkRect: (scrollRect:DOMRect,rect:DOMRect)=>boolean
): number {
	const scrollRect=$scrollingPart.getBoundingClientRect()
	const checkIndexBound=(k:number)=>k*d<indexBound*d
	for (let j=fromIndex;checkIndexBound(j);j+=d) {
		if (checkRect(scrollRect,$es[j].getBoundingClientRect())) continue
		if (j*d>fromIndex*d) {
			return j
		} else {
			return j+d
		}
	}
	if (checkIndexBound(fromIndex)) {
		return indexBound
	}
	return fromIndex
}
