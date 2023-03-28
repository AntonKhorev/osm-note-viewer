export default class NoteViewerStorage {
	constructor(private readonly prefix: string) {}
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
		for (let i=0;i<localStorage.length;i++) {
			const k=localStorage.key(i)
			if (!k?.startsWith(this.prefix)) continue
			result.push(k.substring(this.prefix.length))
		}
		return result
	}
	clear(): void {
		for (const k of this.getKeys()) {
			this.removeItem(k)
		}
	}
}
