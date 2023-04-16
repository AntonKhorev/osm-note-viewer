const swipeCompletionFraction=1/4
const swipeDecideDirectionProgress=.2

export default function installFigureSwipe(
	$figure: HTMLElement,
	$img: HTMLImageElement,
	canSwitchImage: ()=>boolean,
	switchImage: (d:1|-1)=>void,
	closeImage: ()=>void
) {
	let swipe: {
		id: number
		startX: number,
		startY: number,
		direction?: 'hor'|'ver'
	}|undefined
	const getSwipeProgressX=(swipeX:number)=>swipeX/($figure.offsetWidth*swipeCompletionFraction)
	const getSwipeProgressY=(swipeY:number)=>swipeY/($figure.offsetHeight*swipeCompletionFraction)
	$figure.onpointerdown=ev=>{
		if (swipe) return
		if (ev.pointerType!='touch') return
		if ($figure.classList.contains('zoomed')) return
		$figure.setPointerCapture(ev.pointerId)
		swipe={
			id: ev.pointerId,
			startX: ev.clientX,
			startY: ev.clientY,
		}
	}
	$figure.onpointerup=$figure.onpointercancel=ev=>{
		if (!swipe || swipe.id!=ev.pointerId) return
		if (swipe.direction=='hor') {
			const swipeX=ev.clientX-swipe.startX
			const swipeProgressX=getSwipeProgressX(swipeX)
			if (swipeProgressX>=+1) {
				switchImage(+1)
			} else if (swipeProgressX<=-1) {
				switchImage(-1)
			}
		} else if (swipe.direction=='ver') {
			const swipeY=ev.clientY-swipe.startY
			const swipeProgressY=getSwipeProgressY(swipeY)
			if (Math.abs(swipeProgressY)>=1) {
				closeImage()
			}
		}
		swipe=undefined
		$img.style.removeProperty('translate')
		$img.style.removeProperty('opacity')
	}
	$figure.onpointermove=ev=>{
		if (!swipe || swipe.id!=ev.pointerId) return
		const swipeX=ev.clientX-swipe.startX
		const swipeProgressX=getSwipeProgressX(swipeX)
		const swipeY=ev.clientY-swipe.startY
		const swipeProgressY=getSwipeProgressY(swipeY)
		if (!swipe.direction) {
			if (!canSwitchImage()) {
				swipe.direction='ver'
			} else if (
				Math.abs(swipeX)>Math.abs(swipeY) &&
				Math.abs(swipeProgressX)>swipeDecideDirectionProgress
			) {
				swipe.direction='hor'
			} else if (
				Math.abs(swipeY)>Math.abs(swipeX) &&
				Math.abs(swipeProgressY)>swipeDecideDirectionProgress
			) {
				swipe.direction='ver'
			}
		}
		const direction=swipe.direction??(Math.abs(swipeX)>Math.abs(swipeY)?'hor':'ver')
		if (direction=='hor') {
			$img.style.translate=`${swipeX}px`
			$img.style.opacity=String(Math.max(0,1-Math.abs(swipeProgressX)))
		} else {
			$img.style.translate=`0px ${swipeY}px`
			$img.style.opacity=String(Math.max(0,1-Math.abs(swipeProgressY)))
		}
	}
}
