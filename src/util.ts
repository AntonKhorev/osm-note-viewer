export function makeUserLink(username: string): HTMLAnchorElement {
	return makeLink(username,`https://www.openstreetmap.org/user/${encodeURIComponent(username)}`)
}

export function makeLink(text: string, href: string, title?: string): HTMLAnchorElement {
	const $link=document.createElement('a')
	$link.href=href
	$link.textContent=text
	if (title!=null) $link.title=title
	return $link
}
