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

export function parseServerListSource(configSource: any): ServerParameters[] {
	if (Array.isArray(configSource)) {
		return configSource.map(parseServerListItem)
	} else {
		return [parseServerListItem(configSource)]
	}
}

export function parseServerListItem(config: any): ServerParameters {
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
		if (typeof config.web == 'string') {
			webUrls=[config.web]
		} else if (Array.isArray(config.web)) {
			webUrls=config.web
		}
		if (typeof config.api == 'string') {
			apiUrl=config.api
		} else {
			apiUrl=webUrls[0]
		}
		if (typeof config.nominatim == 'string') nominatimUrl=config.nominatim
		if (typeof config.overpass == 'string') overpassUrl=config.overpass
		if (typeof config.overpassTurbo == 'string') overpassTurboUrl=config.overpassTurbo
		if (typeof config.tiles == 'string') {
			tileAttributionUrl=tileAttributionText=undefined
			tileUrlTemplate=config.tiles
		} else if (typeof config.tiles == 'object' && config.tiles) {
			tileAttributionUrl=tileAttributionText=undefined
			if (typeof config.tiles.template == 'string') tileUrlTemplate=config.tiles.template
			;[tileAttributionUrl,tileAttributionText]=parseUrlTextPair(tileAttributionUrl,tileAttributionText,config.tiles.attribution)
			if (typeof config.tiles.zoom == 'number') maxZoom=config.tiles.zoom
		}
		if (typeof config.world == 'string') world=config.world
		;[noteUrl,noteText]=parseUrlTextPair(noteUrl,noteText,config.note)
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
	urlValue:string|undefined,textValue:string|undefined,newItems:any
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
	return [urlValue,textValue]
}
