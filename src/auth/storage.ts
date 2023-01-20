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
	readonly manualCodeUri=`urn:ietf:wg:oauth:2.0:oob`
	readonly installUri=`${location.protocol}//${location.host}${location.pathname}`
	constructor(
		private readonly storage: NoteViewerStorage,
		private readonly host: string
	) {}
	get prefix():string {
		return `host[${this.host}].`
	}
	get clientId():string {
		return this.storage.getString(`${this.prefix}clientId`)
	}
	set clientId(clientId:string) {
		this.storage.setString(`${this.prefix}clientId`,clientId)
	}
	get isManualCodeEntry():boolean {
		return this.storage.getBoolean(`${this.prefix}isManualCodeEntry`)
	}
	set isManualCodeEntry(isManualCodeEntry:boolean) {
		this.storage.setBoolean(`${this.prefix}isManualCodeEntry`,isManualCodeEntry)
	}
	get redirectUri():string {
		return this.isManualCodeEntry?this.manualCodeUri:this.installUri
	}
	getLogins():Map<string,Login> {
		const logins=new Map<string,Login>
		const loginsString=this.storage.getItem(`${this.prefix}logins`)
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
		this.storage.setItem(`${this.prefix}logins`,JSON.stringify([...logins.entries()]))
	}
}
