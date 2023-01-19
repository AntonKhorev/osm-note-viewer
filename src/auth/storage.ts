import type NoteViewerStorage from '../storage'

type Login = {
	scope: string,
	uid: number,
	username: string
}
function isLogin(data:any): data is Login {
	return (
		data && 
		typeof data == 'object' &&
		typeof data.scope == 'string' &&
		typeof data.uid == 'number' &&
		typeof data.username == 'string'
	)
}

export default class AuthStorage {
	constructor(
		private readonly storage: NoteViewerStorage,
		private readonly host: string
	) {}
	get clientId():string {
		return this.storage.getString(`host[${this.host}].clientId`)
	}
	set clientId(clientId:string) {
		this.storage.setString(`host[${this.host}].clientId`,clientId)
	}
	getLogins():Map<string,Login> {
		const logins=new Map<string,Login>
		const loginsString=this.storage.getItem(`host[${this.host}].logins`)
		if (loginsString==null) return logins
		let loginsArray: unknown
		try {
			loginsArray=JSON.parse(loginsString)
		} catch {}
		if (!Array.isArray(loginsArray)) return logins
		for (const loginsArrayEntry of loginsArray) {
			if (!Array.isArray(loginsArrayEntry)) continue
			const [token,login]=loginsArrayEntry
			if (typeof token != 'string') continue
			if (!isLogin(login)) continue
			logins.set(token,login)
		}
		return logins
	}
	setLogin(token:string,login:Login):void {
		const logins=this.getLogins()
		logins.set(token,login)
		this.setLoginsStorageItem(logins)
	}
	deleteLogin(token:string):void {
		const logins=this.getLogins()
		logins.delete(token)
		this.setLoginsStorageItem(logins)
	}
	private setLoginsStorageItem(logins:Map<string,Login>):void {
		this.storage.setItem(`host[${this.host}].logins`,JSON.stringify([...logins.entries()]))
	}
}
