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

export function hideElement($e:HTMLElement) {
	$e.style.display='none'
}
export function unhideElement($e:HTMLElement) {
	$e.style.removeProperty('display')
}
export function toggleHideElement($e:HTMLElement,toggle:boolean) {
	if (toggle) {
		hideElement($e)
	} else {
		unhideElement($e)
	}
}
export function toggleUnhideElement($e:HTMLElement,toggle:boolean) {
	toggleHideElement($e,!toggle)
}

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
	action: ()=>Promise<void>,
	KnownError: Function, // KnownError: typeof TypeError,
	$actionButton: HTMLButtonElement,
	$errorClassReceiver: HTMLElement,
	errorMessageWriter: (message:string)=>void
): Promise<void> {
	try {
		$actionButton.disabled=true
		$errorClassReceiver.classList.remove('error')
		errorMessageWriter('')
		await action()
	} catch (ex) {
		$errorClassReceiver.classList.add('error')
		if (ex instanceof TypeError && ex instanceof KnownError) {
			errorMessageWriter(ex.message)
		} else {
			errorMessageWriter(`Unknown error ${ex}`)
		}
	} finally {
		$actionButton.disabled=false
	}
}
