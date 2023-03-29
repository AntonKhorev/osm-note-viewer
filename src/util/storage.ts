export interface SimpleStorage {
	getItem(k: string): string | null
	setItem(k: string, v: string): void
	removeItem(k: string): void
}

export function getStorageString(storage: SimpleStorage, k: string): string {
	return storage.getItem(k)??''
}

export function setStorageString(storage: SimpleStorage, k: string, v: string): void {
	if (v!='') {
		storage.setItem(k,v)
	} else {
		storage.removeItem(k)
	}
}

export function getStorageBoolean(storage: SimpleStorage, k: string): boolean {
	return !!storage.getItem(k)
}

export function setStorageBoolean(storage: SimpleStorage, k: string, v: boolean): void {
	if (v) {
		storage.setItem(k,'1')
	} else {
		storage.removeItem(k)
	}
}

export class PrefixedLocalStorage implements SimpleStorage {
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
