export function makeLink(text: string, href: string, title?: string): HTMLAnchorElement {
	const $link=document.createElement('a')
	$link.href=href
	$link.textContent=text
	if (title!=null) $link.title=title
	return $link
}

export function makeElement<K extends keyof HTMLElementTagNameMap>(tag: K): ((...classes: string[])=>(...items: Array<string|HTMLElement>)=>HTMLElementTagNameMap[K]) {
	return (...classes)=>(...items)=>{
		const $element=document.createElement(tag)
		if (classes.length>0) $element.classList.add(...classes)
		$element.append(...items)
		return $element
	}
}

export const makeDiv=makeElement('div')
export const makeLabel=makeElement('label')

export function makeSemiLink(...classes: string[]): (...items: Array<string|HTMLElement>)=>HTMLAnchorElement {
	const makeWithItems=makeElement('a')(...classes)
	return (...items)=>{
		const $a=makeWithItems(...items)
		$a.setAttribute('tabindex','0')
		$a.addEventListener('keydown',semiLinkKeydownListener)
		return $a
	}
}
function semiLinkKeydownListener(this: HTMLAnchorElement, ev: KeyboardEvent): void {
	if (ev.key!='Enter') return
	this.click()
	ev.preventDefault()
	ev.stopPropagation()
}

export function startAnimation($element: HTMLElement, animationName: string, animationDuration: string): void {
	if (resetAnimation($element,animationName)) return
	$element.style.animationName=animationName
	$element.style.animationDuration=animationDuration
}
export function resetAnimation($element: HTMLElement, animationName: string): boolean {
	const animation=getAnimation($element,animationName)
	if (!animation) return false
	animation.currentTime=0
	return true
}
export function cleanupAnimationOnEnd($element: HTMLElement): void {
	$element.addEventListener('animationend',animationEndListener)
}
function animationEndListener(this: HTMLElement): void {
	this.style.removeProperty('animation-name')
	this.style.removeProperty('animation-duration')
}
function getAnimation($element: HTMLElement, animationName: string): CSSAnimation | undefined {
	if (typeof CSSAnimation == 'undefined') return // experimental technology, implemented in latest browser versions
	for (const animation of $element.getAnimations()) {
		if (!(animation instanceof CSSAnimation)) continue
		if (animation.animationName==animationName) return animation
	}
}

export async function wrapFetch(
	$actionButton: HTMLButtonElement,
	action: ()=>Promise<void>,
	getErrorMessage: (ex:unknown)=>string,
	$errorClassReceiver: HTMLElement,
	writeErrorMessage: (message:string)=>void
): Promise<void> {
	try {
		$actionButton.disabled=true
		$errorClassReceiver.classList.remove('error')
		writeErrorMessage('')
		await action()
	} catch (ex) {
		$errorClassReceiver.classList.add('error')
		writeErrorMessage(getErrorMessage(ex))
	} finally {
		$actionButton.disabled=false
	}
}
export function wrapFetchForButton(
	$actionButton: HTMLButtonElement,
	action: ()=>Promise<void>,
	getErrorMessage: (ex:unknown)=>string
): Promise<void> {
	return wrapFetch(
		$actionButton,
		action,
		getErrorMessage,
		$actionButton,
		message=>$actionButton.title=message
	)
}

export function makeGetKnownErrorMessage(
	KnownError: Function // KnownError: typeof TypeError,
): (ex:unknown)=>string {
	return (ex:unknown)=>{
		if (ex instanceof TypeError && ex instanceof KnownError) {
			return ex.message
		} else {
			return `Unknown error ${ex}`
		}
	}
}
