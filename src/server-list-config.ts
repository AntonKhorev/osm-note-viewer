export default [
	null,
	{
		web: `https://master.apis.dev.openstreetmap.org/`,
		note: [
			`OSM sandbox/development server`,
			`https://wiki.openstreetmap.org/wiki/Sandbox_for_editing#Experiment_with_the_API_(advanced)`
		]
	},
	{
		web: [
			`https://www.openhistoricalmap.org/`,
			`https://openhistoricalmap.org/`
		],
		nominatim: `https://nominatim.openhistoricalmap.org/`,
		overpass: `https://overpass-api.openhistoricalmap.org/`,
		overpassTurbo: `https://openhistoricalmap.github.io/overpass-turbo/`,
		note: `no tiles support`
	},
	{
		web: `https://opengeofiction.net/`,
		tiles: {
			template: `https://tiles04.rent-a-planet.com/ogf-carto/{z}/{x}/{y}.png`,
			attribution: `OpenGeofiction and contributors`
		},
		overpass: `https://overpass.ogf.rent-a-planet.com/`,
		overpassTurbo: `https://turbo.ogf.rent-a-planet.com/`,
		world: `opengeofiction`
	},
	{
		web: `https://fosm.org/`,
		tiles: {
			template: `https://map.fosm.org/default/{z}/{x}/{y}.png`,
			attribution: `https://fosm.org/`,
			zoom: 18
		},
		note: `mostly useless here because notes are not implemented on this server`
	}
]
