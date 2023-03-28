import type {SimpleStorage} from '../util/storage'
import {getStorageString, setStorageString, getStorageBoolean, setStorageBoolean} from '../util/storage'
import {isArray, isArrayOfStrings} from '../util/types'

export type Login = {
	scope: string,
	uid: number,
	username: string,
	roles?: string[]
}
function makeLogin(data: unknown): Login {
	if (
		!data || typeof data != 'object' ||
		!('scope' in data) || typeof data.scope != 'string' ||
		!('uid' in data) || typeof data.uid != 'number' ||
		!('username' in data) || typeof data.username != 'string'
	) throw new TypeError(`Invalid login data`)
	const login: Login = {
		scope: data.scope,
		uid: data.uid,
		username: data.username
	}
	if (
		('roles' in data) && isArrayOfStrings(data.roles)
	) {
		login.roles=data.roles
	}
	return login
}

export default class AuthStorage {
	readonly manualCodeUri=`urn:ietf:wg:oauth:2.0:oob`
	constructor(
		private readonly storage: SimpleStorage,
		private readonly host: string,
		readonly installUri: string
	) {}
	get prefix(): string {
		return `host[${this.host}].`
	}
	get clientId(): string {
		return getStorageString(this.storage,`${this.prefix}clientId`)
	}
	set clientId(clientId: string) {
		setStorageString(this.storage,`${this.prefix}clientId`,clientId)
	}
	get isManualCodeEntry(): boolean {
		return getStorageBoolean(this.storage,`${this.prefix}isManualCodeEntry`)
	}
	set isManualCodeEntry(isManualCodeEntry: boolean) {
		setStorageBoolean(this.storage,`${this.prefix}isManualCodeEntry`,isManualCodeEntry)
	}
	get token(): string {
		return getStorageString(this.storage,`${this.prefix}token`)
	}
	set token(token: string) {
		setStorageString(this.storage,`${this.prefix}token`,token)
	}
	get redirectUri(): string {
		return this.isManualCodeEntry?this.manualCodeUri:this.installUri
	}
	getLogins(): Map<string,Readonly<Login>> {
		const logins=new Map<string,Readonly<Login>>
		const loginsString=this.storage.getItem(`${this.prefix}logins`)
		if (loginsString==null) return logins
		let loginsArray: unknown
		try {
			loginsArray=JSON.parse(loginsString)
		} catch {}
		if (!isArray(loginsArray)) return logins
		for (const loginsArrayEntry of loginsArray) {
			if (!isArray(loginsArrayEntry)) continue
			const [token,loginData]=loginsArrayEntry
			if (typeof token != 'string') continue
			try {
				const login=makeLogin(loginData)
				logins.set(token,login)
			} catch {}
		}
		return logins
	}
	setLogin(token:string, login:Readonly<Login>): void {
		const logins=this.getLogins()
		logins.set(token,login)
		this.setLoginsStorageItem(logins)
	}
	deleteLogin(token:string): void {
		const logins=this.getLogins()
		logins.delete(token)
		this.setLoginsStorageItem(logins)
	}
	get login(): Readonly<Login>|undefined {
		return this.getLogins().get(this.token)
	}
	private setLoginsStorageItem(logins:Map<string,Readonly<Login>>):void {
		this.storage.setItem(`${this.prefix}logins`,JSON.stringify([...logins.entries()]))
	}
}
