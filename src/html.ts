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

export function startOrResetFadeAnimation($element: HTMLElement, animationName: string, animationClass: string): void {
	if ($element.classList.contains(animationClass)) {
		resetFadeAnimation($element,animationName)
	} else {
		$element.classList.add(animationClass)
	}
}
export function resetFadeAnimation($element: HTMLElement, animationName: string): void {
	const animation=getFadeAnimation($element,animationName)
	if (!animation) return
	animation.currentTime=0
}
function getFadeAnimation($element: HTMLElement, animationName: string): CSSAnimation | undefined {
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
