import {ValidUserQuery} from './query-user'

export function makeUserLink(user: ValidUserQuery|string, text?: string): HTMLAnchorElement {
	const fromId=(id: number)=>`https://api.openstreetmap.org/api/0.6/user/${encodeURIComponent(id)}`
	const fromName=(name: string)=>`https://www.openstreetmap.org/user/${encodeURIComponent(name)}`
	if (typeof user == 'string') {
		return makeLink(text??user,fromName(user))
	} else if (user.userType=='id') {
		return makeLink(text??'#'+user.uid,fromId(user.uid))
	} else {
		return makeLink(text??user.username,fromName(user.username))
	}
}

export function makeLink(text: string, href: string, title?: string): HTMLAnchorElement {
	const $link=document.createElement('a')
	$link.href=href
	$link.textContent=text
	if (title!=null) $link.title=title
	return $link
}

export const makeDiv=(...classes: string[])=>(...items: Array<string|HTMLElement>)=>{
	const $div=document.createElement('div')
	$div.classList.add(...classes)
	$div.append(...items)
	return $div
}

export const makeLabel=(...classes: string[])=>(...items: Array<string|HTMLElement>)=>{
	const $label=document.createElement('label')
	$label.classList.add(...classes)
	$label.append(...items)
	return $label
}

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
