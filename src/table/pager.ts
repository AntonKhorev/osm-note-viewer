export default class Pager {
	constructor(
		private $scrollingPart: Element
	) {}
	goPageUp($items: Element[], fromIndex: number): number {
		return getNextPageIndex(this.$scrollingPart,$items,fromIndex,-1,-1)
	}
	goPageDown($items: Element[], fromIndex: number): number {
		return getNextPageIndex(this.$scrollingPart,$items,fromIndex,+1,$items.length)
	}
}

function getNextPageIndex(
	$scrollingPart: Element,
	$items: Element[],
	fromIndex: number,
	d: number,
	indexBound: number
): number {
	const getY=(i:number)=>$items[i].getBoundingClientRect().y
	const scrollByY=$scrollingPart.clientHeight
	const fromY=getY(fromIndex)
	const checkIndexBound=(k:number)=>k*d<indexBound*d
	let j=fromIndex
	for (;checkIndexBound(j);j+=d) {
		if ((getY(j)-fromY)*d>=scrollByY) break
	}
	if (j==fromIndex) return j+d // go ahead by at least one position
	return j
}
