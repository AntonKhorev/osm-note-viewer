export function makeUserLink(uid: number, username?: string, text?: string): HTMLElement {
	if (username) return makeUserNameLink(username,text)
	return makeUserIdLink(uid,text)
}

export function makeUserNameLink(username: string, text?: string): HTMLAnchorElement {
	const fromName=(name: string)=>`https://www.openstreetmap.org/user/${encodeURIComponent(name)}`
	return makeLink(text??username,fromName(username))
}

export function makeUserIdLink(uid: number, text?: string): HTMLAnchorElement {
	const fromId=(id: number)=>`https://api.openstreetmap.org/api/0.6/user/${encodeURIComponent(id)}`
	return makeLink(text??'#'+uid,fromId(uid))
}

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
		$element.classList.add(...classes)
		$element.append(...items)
		return $element
	}
}

export const makeDiv=makeElement('div')
export const makeLabel=makeElement('label')

export function escapeRegex(text: string) { // https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript/3561711
	return text.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&')
}

export function escapeXml(text: string) { // https://github.com/Inist-CNRS/node-xml-writer
	return text
		.replace(/&/g,'&amp;')
		.replace(/</g,'&lt;')
		.replace(/"/g,'&quot;')
		.replace(/\t/g,'&#x9;')
		.replace(/\n/g,'&#xA;')
		.replace(/\r/g,'&#xD;')
}

export function makeEscapeTag(escapeFn: (text: string) => string): (strings: TemplateStringsArray, ...values: unknown[]) => string {
	return function(strings: TemplateStringsArray, ...values: unknown[]): string {
		let result=strings[0]
		for (let i=0;i<values.length;i++) {
			result+=escapeFn(String(values[i]))+strings[i+1]
		}
		return result
	}
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
