export default class Pager {
	constructor(
		private $scrollingPart: Element
	) {}
	goPageUp($items: Element[], $fromItem: Element, fromIndex: number): number {
		return getNextPageIndex(this.$scrollingPart,$items,$fromItem,fromIndex,-1,-1)
	}
	goPageDown($items: Element[], $fromItem: Element, fromIndex: number): number {
		return getNextPageIndex(this.$scrollingPart,$items,$fromItem,fromIndex,+1,$items.length)
	}
}

function getNextPageIndex(
	$scrollingPart: Element,
	$items: Element[],
	$fromItem: Element, // possibly not in $items but needed for y calculation
	fromIndex: number,
	d: number,
	indexBound: number
): number {
	const getY=($e:Element)=>$e.getBoundingClientRect().y
	const scrollByY=$scrollingPart.clientHeight
	const fromY=getY($fromItem)
	const checkIndexBound=(k:number)=>k*d<indexBound*d
	let i=fromIndex
	for (;checkIndexBound(i);i+=d) {
		if ((getY($items[i])-fromY)*d>=scrollByY) break
	}
	if (i==fromIndex) return i+d // go ahead by at least one position
	return i
}
