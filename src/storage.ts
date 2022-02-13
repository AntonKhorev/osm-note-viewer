export default class NoteViewerStorage {
	prefix: string
	constructor(prefix: string) {
		this.prefix=prefix
	}
	getItem(k: string): string | null {
		return localStorage.getItem(this.prefix+k)
	}
	setItem(k: string, v: string): void {
		localStorage.setItem(this.prefix+k,v)
	}
	removeItem(k: string): void {
		localStorage.removeItem(this.prefix+k)
	}
	getKeys(): string[] { // don't return iterator because may want to modify stuff while iterating
		const result:string[]=[]
		for (const k in localStorage) {
			if (!localStorage.hasOwnProperty(k)) continue
			if (!k.startsWith(this.prefix)) continue
			result.push(k.substring(this.prefix.length))
		}
		return result
	}
	computeSize(): number {
		let size=0
		for (const k of this.getKeys()) {
			const value=this.getItem(k)
			if (value==null) continue
			size+=(value.length+this.prefix.length+k.length)*2
		}
		return size
	}
	clear(): void {
		for (const k of this.getKeys()) {
			this.removeItem(k)
		}
	}
}
