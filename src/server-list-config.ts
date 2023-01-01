export default [
	null,
	`https://master.apis.dev.openstreetmap.org/`,
	{
		web: [
			`https://www.openhistoricalmap.org/`,
			`https://openhistoricalmap.org/`
		],
		nominatim: `https://nominatim.openhistoricalmap.org/`,
		overpass: `https://overpass-api.openhistoricalmap.org/`,
		overpassTurbo: `https://openhistoricalmap.github.io/overpass-turbo/`,
	},
	{
		web: `https://opengeofiction.net/`,
		tiles: `https://tiles04.rent-a-planet.com/ogf-carto/{z}/{x}/{y}.png`,
		overpass: `https://overpass.ogf.rent-a-planet.com/`,
		overpassTurbo: `https://turbo.ogf.rent-a-planet.com/`
	},
	{
		web: `https://fosm.org/`,
		tiles: {
			template: `https://map.fosm.org/default/{z}/{x}/{y}.png`,
			attribution: `https://fosm.org/`,
			zoom: 18
		}
	}
]
