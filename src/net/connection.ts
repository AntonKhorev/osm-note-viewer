import type AuthStorage from './auth-storage'
import type Server from './server'

export default class Connection {
	constructor(
		readonly server: Server,
		private readonly authStorage: AuthStorage
	) {}
	get token(): string {
		return this.authStorage.token
	}
	get username(): string|undefined {
		return this.authStorage.login?.username
	}
	get uid(): number|undefined {
		return this.authStorage.login?.uid
	}
	get isModerator(): boolean {
		return this.authStorage.login?.roles?.includes('moderator')??false
	}
}
