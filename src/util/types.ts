export function isObject(value: unknown): value is object {
	return !!(value && typeof value == 'object')
}

export function isArrayOfStrings(value: unknown): value is string[] {
	return isArray(value) && value.every(item => typeof item == 'string')
}
export function isArrayOfNumbers(value: unknown): value is number[] {
	return isArray(value) && value.every(item => typeof item == 'number')
}
export function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value)
}

export function isDefined<T>(argument: T | undefined): argument is T {
	return argument !== undefined
}
