export type ServerParameters = [
	host: string,
	apiUrl: string,
	webUrls: string[],
	tileUrlTemplate: string,
	tileAttributionUrl: string,
	tileAttributionText: string,
	maxZoom: number,
	nominatimUrl: string|undefined,
	overpassUrl: string|undefined,
	overpassTurboUrl: string|undefined,
	noteUrl: string|undefined,
	noteText: string|undefined,
	world: string
]

export function parseServerListSource(configSource: unknown): ServerParameters[] {
	if (Array.isArray(configSource)) {
		return configSource.map(parseServerListItem)
	} else {
		return [parseServerListItem(configSource)]
	}
}

export function parseServerListItem(config: unknown): ServerParameters {
	let apiUrl: string = `https://api.openstreetmap.org/`
	let webUrls: string[] = [
		`https://www.openstreetmap.org/`,
		`https://openstreetmap.org/`,
		`https://www.osm.org/`,
		`https://osm.org/`,
	]
	let tileUrlTemplate: string = `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
	let tileAttributionUrl: string|undefined = `https://www.openstreetmap.org/copyright`
	let tileAttributionText: string|undefined = `OpenStreetMap contributors`
	let maxZoom: number = 19
	let nominatimUrl: string|undefined
	let overpassUrl: string|undefined
	let overpassTurboUrl: string|undefined
	let noteUrl: string|undefined
	let noteText: string|undefined
	let world = 'earth'
	
	if (typeof config == 'string') {
		apiUrl=config
		webUrls=[config]
	} else if (typeof config == 'object' && config) {
		if ('web' in config) {
			if (Array.isArray(config.web)) {
				webUrls=config.web.map(requireUrlStringProperty)
			} else {
				webUrls=[requireUrlStringProperty(config.web)]
			}
		}
		if ('api' in config) {
			apiUrl=requireUrlStringProperty(config.api)
		} else {
			apiUrl=webUrls[0]
		}
		if ('nominatim' in config) nominatimUrl=requireUrlStringProperty(config.nominatim)
		if ('overpass' in config) overpassUrl=requireUrlStringProperty(config.overpass)
		if ('overpassTurbo' in config) overpassTurboUrl=requireUrlStringProperty(config.overpassTurbo)

		if ('tiles' in config) {
			tileAttributionUrl=tileAttributionText=undefined
			if (typeof config.tiles == 'object' && config.tiles) {
				if ('template' in config.tiles) tileUrlTemplate=requireStringProperty(config.tiles.template)
				if ('attribution' in config.tiles) [tileAttributionUrl,tileAttributionText]=parseUrlTextPair(tileAttributionUrl,tileAttributionText,config.tiles.attribution)
				if ('zoom' in config.tiles) maxZoom=requireNumberProperty(config.tiles.zoom)
			} else {
				tileUrlTemplate=requireStringProperty(config.tiles)
			}
		}
		if ('world' in config) world=requireStringProperty(config.world)
		if ('note' in config) [noteUrl,noteText]=parseUrlTextPair(noteUrl,noteText,config.note)
	} else if (config == null) {
		noteText=`main OSM server`
		nominatimUrl=`https://nominatim.openstreetmap.org/`
		overpassUrl=`https://www.overpass-api.de/`
		overpassTurboUrl=`https://overpass-turbo.eu/`
	} else {
		throw new RangeError(`server specification expected to be null, string or array; got ${typeof config} instead`)
	}
	
	let host: string
	try {
		const hostUrl=new URL(webUrls[0])
		host=hostUrl.host
	} catch (ex) {
		throw new RangeError(`invalid web property value "${webUrls[0]}"`)
	}

	return [
		host,apiUrl,webUrls,
		tileUrlTemplate,
		tileAttributionUrl ?? deriveAttributionUrl(webUrls),
		tileAttributionText ?? deriveAttributionText(webUrls),
		maxZoom,
		nominatimUrl,overpassUrl,overpassTurboUrl,
		noteUrl,noteText,
		world
	]
}

function requireUrlStringProperty(v: unknown): string {
	if (typeof v != 'string') throw new RangeError(`property required to be string; got ${typeof v} instead`)
	// TODO test url
	return v
}

function requireStringProperty(v: unknown): string {
	if (typeof v != 'string') throw new RangeError(`property required to be string; got ${typeof v} instead`)
	return v
}

function requireNumberProperty(v: unknown): number {
	if (typeof v != 'number') throw new RangeError(`property required to be number; got ${typeof v} instead`)
	return v
}

function deriveAttributionUrl(webUrls: string[]): string {
	return webUrls[0]+`copyright`
}

function deriveAttributionText(webUrls: string[]): string {
	try {
		const hostUrl=new URL(webUrls[0])
		return hostUrl.host+` contributors`
	} catch {
		return webUrls[0]+` contributors`
	}
}

function parseUrlTextPairItem(
	urlValue:string|undefined,textValue:string|undefined,newValue:string
):[
	newUrlValue:string|undefined,newTextValue:string|undefined
] {
	try {
		const url=new URL(newValue)
		return [url.href,textValue]
	} catch {
		return [urlValue,newValue]
	}
}
function parseUrlTextPair(
	urlValue:string|undefined,textValue:string|undefined,newItems:unknown
):[
	newUrlValue:string|undefined,newTextValue:string|undefined
] {
	if (typeof newItems == 'string') {
		[urlValue,textValue]=parseUrlTextPairItem(urlValue,textValue,newItems)
	} else if (Array.isArray(newItems)) {
		for (const newValue of newItems) {
			if (typeof newValue == 'string') {
				[urlValue,textValue]=parseUrlTextPairItem(urlValue,textValue,newValue)
			}
		}
	}
	// TODO fail on other types
	return [urlValue,textValue]
}
