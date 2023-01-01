export default function parseServerListItem(config: any): [
	apiUrl: string,
	webUrls: string[],
	tileUrlTemplate: string,
	tileAttributionUrl: string,
	tileAttributionText: string,
	maxZoom: number,
	nominatimUrl: string,
	overpassUrl: string,
	overpassTurboUrl: string,
	noteUrl: string|undefined,
	noteText: string|undefined
] {
	let apiUrl: string = `https://api.openstreetmap.org/`
	let webUrls: string[] = [
		`https://www.openstreetmap.org/`,
		`https://openstreetmap.org/`,
		`https://www.osm.org/`,
		`https://osm.org/`,
	]
	let tileUrlTemplate: string = `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
	let tileAttributionUrl: string = `https://www.openstreetmap.org/copyright`
	let tileAttributionText: string = `OpenStreetMap contributors`
	let maxZoom: number = 19
	let nominatimUrl: string = `https://nominatim.openstreetmap.org/`
	let overpassUrl: string = `https://www.overpass-api.de/`
	let overpassTurboUrl: string = `https://overpass-turbo.eu/`
	let noteUrl: string|undefined
	let noteText: string|undefined
	
	const tryAttributionText=()=>{
		try {
			const hostUrl=new URL(webUrls[0])
			tileAttributionText=hostUrl.host+` contributors`
		} catch {
			tileAttributionText=webUrls[0]+` contributors`
		}
	}
	const tryUrlTextPairItem=(
		urlValue:string|undefined,textValue:string|undefined,newValue:string
	):[
		newUrlValue:string|undefined,newTextValue:string|undefined
	]=>{
		try {
			const url=new URL(newValue)
			return [url.href,textValue]
		} catch {
			return [urlValue,newValue]
		}
	}

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
			tileUrlTemplate=config.tiles
			tileAttributionUrl=webUrls[0]+`copyright`
			tryAttributionText()
		} else if (typeof config.tiles == 'object' && config.tiles) {
			if (typeof config.tiles.template == 'string') tileUrlTemplate=config.tiles.template
			if (typeof config.tiles.attribution == 'string') tileAttributionUrl=config.tiles.attribution
			tryAttributionText()
			if (typeof config.tiles.zoom == 'number') maxZoom=config.tiles.zoom
		}
		if (typeof config.note == 'string') {
			[noteUrl,noteText]=tryUrlTextPairItem(noteUrl,noteText,config.note)
		} else if (Array.isArray(config.note)) {
			for (const notePart of config.note) {
				if (typeof notePart == 'string') {
					[noteUrl,noteText]=tryUrlTextPairItem(noteUrl,noteText,notePart)
				}
			}
		}
	} else if (!config) {
		noteText=`main OSM server`
	}

	return [
		apiUrl,webUrls,
		tileUrlTemplate,tileAttributionUrl,tileAttributionText,maxZoom,
		nominatimUrl,overpassUrl,overpassTurboUrl,
		noteUrl,noteText
	]
}
