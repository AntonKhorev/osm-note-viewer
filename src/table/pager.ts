export default class Pager {
	constructor(
		private $scrollingPart: Element
	) {}
	goPageUp($items: Element[], fromIndex: number): number {
		return getNextPageIndex(this.$scrollingPart,$items,fromIndex,-1,-1,
			(scrollRect,rect)=>rect.top>scrollRect.top-scrollRect.height
		)
	}
	goPageDown($items: Element[], fromIndex: number): number {
		return getNextPageIndex(this.$scrollingPart,$items,fromIndex,+1,$items.length,
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
	let j=fromIndex
	for (;checkIndexBound(j);j+=d) {
		if (!checkRect(scrollRect,$es[j].getBoundingClientRect())) break
	}
	if (j==fromIndex) return j+d
	return j
}
