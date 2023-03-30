import type Server from './server'

export default interface ServerSelector {
	selectServer(): Server|undefined
	getServerSelectHref(server: Server): string
	addServerSelectToAppInstallLocationHref(server: Server, installLocationHref: string): string
	makeServerSelectErrorMessage(): (string|HTMLElement)[]
}
