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

export function escapeHash(text: string) {
	return text.replace(
		/[^0-9a-zA-Z?/:@._~!$'()*+,;-]/g, // https://stackoverflow.com/a/26119120 except & and =
		c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}` // escape like in https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI#encoding_for_rfc3986
	)
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
