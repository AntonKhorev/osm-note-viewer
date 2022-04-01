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

export function escapeRegex(text: string) { // https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript/3561711
	return text.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&')
}
