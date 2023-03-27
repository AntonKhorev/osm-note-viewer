export type ServerParameters = [
	host: string,
	apiUrl: string,
	webUrls: string[],
	tileUrlTemplate: string,
	tileAttributionUrl: string,
	tileAttributionText: string,
	tileMaxZoom: number,
	tileOwner: boolean,
	nominatimUrl: string|undefined,
	overpassUrl: string|undefined,
	overpassTurboUrl: string|undefined,
	noteUrl: string|undefined,
	noteText: string|undefined,
	world: string,
	oauthUrl: string|undefined,
	oauthId: string|undefined,
]

export function parseServerListSource(configSource: unknown): ServerParameters[] {
	if (Array.isArray(configSource)) {
		return configSource.map(parseServerListItem)
	} else {
		return [parseServerListItem(configSource)]
	}
}

export function parseServerListItem(config: unknown): ServerParameters {
	let apiUrl: string|undefined
	let webUrls: string[]|undefined
	let tileUrlTemplate: string = `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
	let tileAttributionUrl: string|undefined = `https://www.openstreetmap.org/copyright`
	let tileAttributionText: string|undefined = `OpenStreetMap contributors`
	let tileMaxZoom: number = 19
	let tileOwner = false
	let nominatimUrl: string|undefined
	let overpassUrl: string|undefined
	let overpassTurboUrl: string|undefined
	let noteUrl: string|undefined
	let noteText: string|undefined
	let world = 'earth'
	let oauthId: string|undefined
	let oauthUrl: string|undefined
	
	if (typeof config == 'string') {
		webUrls=[requireUrlStringProperty('web',config)]
	} else if (typeof config == 'object' && config) {
		if ('web' in config) {
			if (Array.isArray(config.web)) {
				if (config.web.length==0) throw new RangeError(`web property as array required to be non-empty`)
				webUrls=config.web.map(value=>requireUrlStringProperty('web',value))
			} else {
				webUrls=[requireUrlStringProperty('web',config.web)]
			}
		}
		if ('api' in config) {
			apiUrl=requireUrlStringProperty('api',config.api)
		}
		if ('nominatim' in config) {
			nominatimUrl=requireUrlStringProperty('nominatim',config.nominatim)
		}
		if ('overpass' in config) {
			overpassUrl=requireUrlStringProperty('overpass',config.overpass)
		}
		if ('overpassTurbo' in config) {
			overpassTurboUrl=requireUrlStringProperty('overpassTurbo',config.overpassTurbo)
		}
		if ('tiles' in config) {
			tileOwner=true
			tileAttributionUrl=tileAttributionText=undefined
			if (typeof config.tiles == 'object' && config.tiles) {
				if ('template' in config.tiles) {
					tileUrlTemplate=requireStringProperty('tiles.template',config.tiles.template)
				}
				if ('attribution' in config.tiles) {
					[tileAttributionUrl,tileAttributionText]=parseUrlTextPair('tiles.attribution',tileAttributionUrl,tileAttributionText,config.tiles.attribution)
				}
				if ('zoom' in config.tiles) {
					tileMaxZoom=requireNumberProperty('tiles.zoom',config.tiles.zoom)
				}
			} else {
				tileUrlTemplate=requireStringProperty('tiles',config.tiles)
			}
		}
		if ('world' in config) {
			world=requireStringProperty('world',config.world)
		}
		if ('note' in config) {
			[noteUrl,noteText]=parseUrlTextPair('note',noteUrl,noteText,config.note)
		}
		if ('oauth' in config) {
			if (!config.oauth || typeof config.oauth != 'object') {
				throw new RangeError(`oauth property required to be object`)
			}
			if ('id' in config.oauth) {
				oauthId=requireStringProperty('oauth.id',config.oauth.id)
			} else {
				throw new RangeError(`oauth property when defined required to contain id`)
			}
			if ('url' in config.oauth) {
				oauthUrl=requireStringProperty('oauth.url',config.oauth.url)
			}
		}
	} else if (config == null) {
		apiUrl=`https://api.openstreetmap.org/`
		webUrls=[
			`https://www.openstreetmap.org/`,
			`https://openstreetmap.org/`,
			`https://www.osm.org/`,
			`https://osm.org/`,
		]
		noteText=`main OSM server`
		nominatimUrl=`https://nominatim.openstreetmap.org/`
		overpassUrl=`https://www.overpass-api.de/`
		overpassTurboUrl=`https://overpass-turbo.eu/`
		tileOwner=true
	} else {
		throw new RangeError(`server specification expected to be null, string or array; got ${type(config)} instead`)
	}
	
	if (!webUrls) {
		throw new RangeError(`missing required web property`)
	}
	let host: string
	try {
		const hostUrl=new URL(webUrls[0])
		host=hostUrl.host
	} catch {
		throw new RangeError(`invalid web property value "${webUrls[0]}"`) // shouldn't happen
	}

	return [
		host,
		apiUrl ?? webUrls[0],
		webUrls,
		tileUrlTemplate,
		tileAttributionUrl ?? deriveAttributionUrl(webUrls),
		tileAttributionText ?? deriveAttributionText(webUrls),
		tileMaxZoom,tileOwner,
		nominatimUrl,overpassUrl,overpassTurboUrl,
		noteUrl,noteText,
		world,
		oauthId,
		oauthUrl
	]
}

function requireUrlStringProperty(name:string, value:unknown): string {
	if (typeof value != 'string') throw new RangeError(`${name} property required to be string; got ${type(value)} instead`)
	try {
		return new URL(value).href
	} catch {
		throw new RangeError(`${name} property required to be url; got "${value}"`)
	}
}
function requireStringProperty(name:string, value:unknown): string {
	if (typeof value != 'string') throw new RangeError(`${name} property required to be string; got ${type(value)} instead`)
	return value
}
function requireNumberProperty(name:string, value:unknown): number {
	if (typeof value != 'number') throw new RangeError(`${name} property required to be number; got ${type(value)} instead`)
	return value
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
	name:string,
	urlValue:string|undefined,textValue:string|undefined,newValue:unknown
):[
	newUrlValue:string|undefined,newTextValue:string|undefined
] {
	if (typeof newValue != 'string') throw new RangeError(`${name} array property requires all elements to be strings; got ${type(newValue)} instead`)
	try {
		const url=new URL(newValue)
		return [url.href,textValue]
	} catch {
		return [urlValue,newValue]
	}
}
function parseUrlTextPair(
	name:string,
	urlValue:string|undefined,textValue:string|undefined,newItems:unknown
):[
	newUrlValue:string|undefined,newTextValue:string|undefined
] {
	if (typeof newItems == 'string') {
		[urlValue,textValue]=parseUrlTextPairItem(name,urlValue,textValue,newItems)
	} else if (Array.isArray(newItems)) {
		for (const newValue of newItems) {
			[urlValue,textValue]=parseUrlTextPairItem(name,urlValue,textValue,newValue)
		}
	} else {
		throw new RangeError(`${name} property required to be string or array of strings; got ${type(newItems)} instead`)
	}
	return [urlValue,textValue]
}

function type(value:unknown): string {
	if (Array.isArray(value)) {
		return 'array'
	} else if (value==null) {
		return 'null'
	} else {
		return typeof value
	}
}
