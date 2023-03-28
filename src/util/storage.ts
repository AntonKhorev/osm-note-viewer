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
