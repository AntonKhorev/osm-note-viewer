const swipeCompletionFraction=1/4
const swipeDecideDirectionProgress=.2
const pinchCompletionScale=1.5

class Pointer {
	id: number
	startX: number
	startY: number
	X: number
	Y: number
	constructor(ev: PointerEvent) {
		this.id=ev.pointerId
		this.startX=ev.clientX; this.X=ev.clientX
		this.startY=ev.clientY; this.Y=ev.clientY
	}
	update(ev: PointerEvent): boolean {
		if (this.id!=ev.pointerId) return false
		this.X=ev.clientX
		this.Y=ev.clientY
		return true
	}
	get dX(): number { return this.X-this.startX }
	get dY(): number { return this.Y-this.startY }
}

type Gesture = {
	type: 'swipe'
	pointer: Pointer
	direction?: 'hor'|'ver'
} | {
	type: 'pinch'
	pointer: Pointer
	pointer2: Pointer
}

export default function installFigureTouchListeners(
	$figure: HTMLElement,
	$img: HTMLImageElement,
	canSwitchImage: ()=>boolean,
	switchImage: (d:1|-1)=>void,
	closeImage: ()=>void,
	zoomImage: (xScrollFraction:number,yScrollFraction:number)=>void
) {
	let gesture: Gesture|undefined
	const getSwipeProgressX=(swipeX:number)=>swipeX/($figure.offsetWidth*swipeCompletionFraction)
	const getSwipeProgressY=(swipeY:number)=>swipeY/($figure.offsetHeight*swipeCompletionFraction)
	const getPinchScale=(ptr1:Pointer,ptr2:Pointer)=>{
		const startSpanX=ptr2.startX-ptr1.startX
		const startSpanY=ptr2.startY-ptr1.startY
		const spanX=ptr2.X-ptr1.X
		const spanY=ptr2.Y-ptr1.Y
		return Math.sqrt((spanX**2+spanY**2)/(startSpanX**2+startSpanY**2))
	}
	const getPinchOrigin=(ptr1:Pointer,ptr2:Pointer,imgRect:DOMRect):[originX:number,originY:number]=>{
		const pinchStartCenterX=(ptr1.startX+ptr2.startX)/2
		const pinchStartCenterY=(ptr1.startY+ptr2.startY)/2
		return [pinchStartCenterX-imgRect.x,pinchStartCenterY-imgRect.y]
	}
	$figure.onpointerdown=ev=>{
		if (ev.pointerType!='touch') return
		if ($figure.classList.contains('zoomed')) return
		if (!gesture) {
			$figure.setPointerCapture(ev.pointerId)
			gesture={
				type: 'swipe',
				pointer: new Pointer(ev)
			}
		} else if (gesture && gesture.type=='swipe') {
			$figure.setPointerCapture(ev.pointerId)
			gesture={
				type: 'pinch',
				pointer: gesture.pointer,
				pointer2: new Pointer(ev) // TODO correct start coords for already shifted image
			}
		}
	}
	$figure.onpointerup=$figure.onpointercancel=ev=>{
		if (!gesture) return
		$img.style.removeProperty('opacity')
		$img.style.removeProperty('translate')
		$img.style.removeProperty('scale')
		$img.style.removeProperty('transform-origin')
		if (gesture.type=='swipe') {
			if (gesture.pointer.id!=ev.pointerId) return
			if (gesture.direction=='hor') {
				const swipeX=ev.clientX-gesture.pointer.startX
				const swipeProgressX=getSwipeProgressX(swipeX)
				if (swipeProgressX>=+1) {
					switchImage(+1)
				} else if (swipeProgressX<=-1) {
					switchImage(-1)
				}
			} else if (gesture.direction=='ver') {
				const swipeY=ev.clientY-gesture.pointer.startY
				const swipeProgressY=getSwipeProgressY(swipeY)
				if (Math.abs(swipeProgressY)>=1) {
					closeImage()
				}
			}
		} else if (gesture.type=='pinch') {
			const scale=getPinchScale(gesture.pointer,gesture.pointer2)
			if (scale>pinchCompletionScale) {
				const imgRect=$img.getBoundingClientRect()
				const [originX,originY]=getPinchOrigin(gesture.pointer,gesture.pointer2,imgRect)
				zoomImage(originX/imgRect.width,originY/imgRect.height)
			}
		}
		gesture=undefined
	}
	$figure.onpointermove=ev=>{
		if (!gesture) return
		if (gesture.type=='swipe') {
			if (
				!gesture.pointer.update(ev)
			) return
			const swipeX=gesture.pointer.dX
			const swipeProgressX=getSwipeProgressX(swipeX)
			const swipeY=gesture.pointer.dY
			const swipeProgressY=getSwipeProgressY(swipeY)
			if (!gesture.direction) {
				if (!canSwitchImage()) {
					gesture.direction='ver'
				} else if (
					Math.abs(swipeX)>Math.abs(swipeY) &&
					Math.abs(swipeProgressX)>swipeDecideDirectionProgress
				) {
					gesture.direction='hor'
				} else if (
					Math.abs(swipeY)>Math.abs(swipeX) &&
					Math.abs(swipeProgressY)>swipeDecideDirectionProgress
				) {
					gesture.direction='ver'
				}
			}
			const direction=gesture.direction??(Math.abs(swipeX)>Math.abs(swipeY)?'hor':'ver')
			if (direction=='hor') {
				$img.style.translate=`${swipeX}px`
				$img.style.opacity=String(Math.max(0,1-Math.abs(swipeProgressX)))
			} else {
				$img.style.translate=`0px ${swipeY}px`
				$img.style.opacity=String(Math.max(0,1-Math.abs(swipeProgressY)))
			}
			$img.style.removeProperty('scale')
		} else if (gesture.type=='pinch') {
			if (
				!gesture.pointer.update(ev) &&
				!gesture.pointer2.update(ev)
			) return
			const scale=getPinchScale(gesture.pointer,gesture.pointer2)
			$img.style.removeProperty('opacity')
			$img.style.removeProperty('translate')
			$img.style.removeProperty('scale')
			const imgRect=$img.getBoundingClientRect()
			const [originX,originY]=getPinchOrigin(gesture.pointer,gesture.pointer2,imgRect)
			$img.style.transformOrigin=`${originX}px ${originY}px`
			$img.style.scale=String(Math.max(1,scale))
		}
	}
}
