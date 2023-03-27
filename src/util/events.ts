export function bubbleEvent($target: HTMLElement, type: string) {
	return $target.dispatchEvent(new Event(type,{bubbles:true}))
}

export function bubbleCustomEvent<T extends keyof HTMLElementEventMap>(
	$target: HTMLElement,
	type: T,
	detail: (HTMLElementEventMap[T] extends CustomEvent<infer D> ? D : never)
) {
	return $target.dispatchEvent(new CustomEvent(type,{
		bubbles: true,
		detail
	}))
}
