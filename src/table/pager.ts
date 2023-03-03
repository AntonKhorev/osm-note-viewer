export default class Pager {
	constructor(
		private $scrollingPart: Element
	) {}
	goPageUp($items: Element[], fromIndex: number): number {
		return getNextPageIndex(this.$scrollingPart,$items,fromIndex,-1,0,
			(scrollRect,rect)=>rect.top>scrollRect.top-scrollRect.height
		)
	}
	goPageDown($items: Element[], fromIndex: number): number {
		return getNextPageIndex(this.$scrollingPart,$items,fromIndex,+1,$items.length-1,
			(scrollRect,rect)=>rect.bottom<scrollRect.bottom+scrollRect.height
		)
	}
}

function getNextPageIndex(
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
