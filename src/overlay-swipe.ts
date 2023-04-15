export default function installFigureSwipe(
	$figure: HTMLElement,
	$img: HTMLImageElement,
	canSwitchImage: ()=>boolean,
	switchImage: (d:1|-1)=>void
) {
	let swipeStartX: number|undefined
	const getSwipeProgress=(swipeX:number)=>swipeX/($figure.offsetWidth/4)
	$figure.onpointerdown=ev=>{
		if (ev.pointerType!='touch') return
		if (!canSwitchImage()) return
		if ($figure.classList.contains('zoomed')) return
		$figure.setPointerCapture(ev.pointerId)
		swipeStartX=ev.clientX
	}
	$figure.onpointerup=$figure.onpointercancel=ev=>{
		if (swipeStartX==null) return
		const swipeX=ev.clientX-swipeStartX
		const swipeProgress=getSwipeProgress(swipeX)
		if (swipeProgress>=+1) {
			switchImage(+1)
		} else if (swipeProgress<=-1) {
			switchImage(-1)
		}
		swipeStartX=undefined
		$img.style.removeProperty('translate')
		$img.style.removeProperty('opacity')
	}
	$figure.onpointermove=ev=>{
		if (swipeStartX==null) return
		const swipeX=ev.clientX-swipeStartX
		$img.style.translate=`${swipeX}px`
		$img.style.opacity=String(Math.max(0,1-Math.abs(getSwipeProgress(swipeX))))
	}
}
