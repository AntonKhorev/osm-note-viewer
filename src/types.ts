export function isArrayOfStrings(value: unknown): value is string[] {
	return isArray(value) && value.every(item => typeof item == 'string')
}
export function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value)
}
