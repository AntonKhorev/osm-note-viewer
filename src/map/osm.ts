import type {
	OsmChangesetApiData, OsmVisibleElementApiData, OsmVisibleElementApiDataMap,
	OsmVisibleNodeApiData, OsmVisibleWayApiData, OsmVisibleRelationApiData
} from '../osm'
import type {
	OsmAdiff, OsmAdiffAction, OsmAdiffElement,
	OsmAdiffNodeElement, OsmAdiffWayElement
} from '../osm-adiff'
import {hasBbox} from '../osm'

export type LayerBoundOsmData = ({
	type: 'element',
	adiff: false,
	item: OsmVisibleElementApiData
} | {
	type: 'element',
	adiff: true,
	item: OsmAdiffAction<OsmAdiffElement>
} | {
	type: 'changeset',
	adiff: boolean,
	item: OsmChangesetApiData
}) & {
	skippedRelationIds?: Set<number>
	emptyReason?: string
}

export type GeometryData = {
	baseGeometry:      [layer:L.Layer|null,data:LayerBoundOsmData]
	extraBaseLayer?: L.Layer
	createdGeometry?:  [layer:L.Layer,data:LayerBoundOsmData][]
	modifiedGeometry?: [layer:L.Layer,data:LayerBoundOsmData][]
	deletedGeometry?:  [layer:L.Layer,data:LayerBoundOsmData][]
}

export function renderOsmElement(element: OsmVisibleElementApiData, elements: OsmVisibleElementApiDataMap): GeometryData {
	if (element.type=='node') {
		const layer=makeOsmNodeLayer(element)
		return {baseGeometry:[
			layer,{type:'element',adiff:false,item:element}
		]}
	} else if (element.type=='way') {
		const layer=makeOsmWayLayer(element,elements)
		return {baseGeometry:[
			layer,{type:'element',adiff:false,item:element}
		]}
	} else if (element.type=='relation') {
		const [layer,skippedRelationIds]=makeOsmRelationLayerAndSkippedRelations(element,elements)
		return {baseGeometry:[
			layer,{
				type:'element',adiff:false,item:element,skippedRelationIds,
				emptyReason:layer?undefined:`the relation has no direct node/way members`
			}
		]}
	} else {
		throw new TypeError(`OSM API error: requested element has unknown type`) // shouldn't happen
	}
}

export function renderOsmChangeset(changeset: OsmChangesetApiData): GeometryData {
	const baseLayer=makeOsmChangesetLayer(changeset)
	return {baseGeometry:[
		baseLayer,{
			type:'changeset',adiff:false,item:changeset,
			emptyReason:baseLayer?undefined:`the changeset is empty`
		}
	]}
}

export function renderOsmChangesetAdiff(changeset: OsmChangesetApiData, adiff: OsmAdiff): GeometryData {
	const colorAdded='#39dbc0' // color values from OSMCha
	const colorModifiedOld='#db950a'
	const colorModifiedNew='#e8e845'
	const colorDeleted='#cc2c47'
	const baseLayer=makeOsmChangesetLayer(changeset,{color:'#000',fill:false})
	const extraBaseLayer=makeOsmChangesetLayer(changeset,{color:'#000',stroke:false,interactive:false})
	const geometryData: GeometryData = {
		baseGeometry:[
			baseLayer,{
				type:'changeset',adiff:true,item:changeset,
				emptyReason:baseLayer?undefined:`the changeset is empty`
			}
		],
		createdGeometry:[],
		modifiedGeometry:[],
		deletedGeometry:[]
	}
	if (extraBaseLayer) geometryData.extraBaseLayer=extraBaseLayer
	const addOsmElementLayer=<T extends OsmAdiffElement>(
		adiffAction: OsmAdiffAction<T>,
		makeLayer: (element:T,color:string)=>L.Layer
	)=>{
		if (adiffAction.action=='create') {
			geometryData.createdGeometry!.push([
				makeLayer(adiffAction.newElement,colorAdded),
				{type:'element',adiff:true,item:adiffAction}
			])
		} else if (adiffAction.action=='modify') {
			const modifyLayer=L.featureGroup()
			modifyLayer.addLayer(
				makeLayer(adiffAction.oldElement,colorModifiedOld)
			)
			modifyLayer.addLayer(
				makeLayer(adiffAction.newElement,colorModifiedNew)
			)
			geometryData.modifiedGeometry!.push([
				modifyLayer,
				{type:'element',adiff:true,item:adiffAction}
			])
		} else if (adiffAction.action=='delete') {
			geometryData.deletedGeometry!.push([
				makeLayer(adiffAction.oldElement,colorDeleted),
				{type:'element',adiff:true,item:adiffAction}
			])
		}
	}
	for (const adiffElement of Object.values(adiff.way)) {
		addOsmElementLayer(adiffElement,makeAdiffWayLayer)
	}
	for (const adiffElement of Object.values(adiff.node)) {
		addOsmElementLayer(adiffElement,makeAdiffNodeLayer)
	}
	return geometryData
}

function makeOsmNodeLayer(node: OsmVisibleNodeApiData): L.Layer {
	return L.circleMarker([node.lat,node.lon])
}

function makeOsmWayLayer(way: OsmVisibleWayApiData, elements: OsmVisibleElementApiDataMap): L.Layer {
	const coords: L.LatLngExpression[] = []
	for (const id of way.nodes) {
		const node=elements.node[id]
		if (!node) throw new TypeError(`OSM API error: referenced element not found in response data`)
		coords.push([node.lat,node.lon])
	}
	return L.polyline(coords)
}

function makeOsmRelationLayerAndSkippedRelations(relation: OsmVisibleRelationApiData, elements: OsmVisibleElementApiDataMap): [
	layer:L.Layer|null,skippedRelationIds:Set<number>
] {
	let layer:L.FeatureGroup|null=null
	const skippedRelationIds=new Set<number>
	for (const member of relation.members) {
		if (member.type=='node') {
			const node=elements.node[member.ref]
			if (!node) throw new TypeError(`OSM API error: referenced element not found in response data`)
			if (!layer) layer=L.featureGroup()
			layer.addLayer(makeOsmNodeLayer(node))
		} else if (member.type=='way') {
			const way=elements.way[member.ref]
			if (!way) throw new TypeError(`OSM API error: referenced element not found in response data`)
			if (!layer) layer=L.featureGroup()
			layer.addLayer(makeOsmWayLayer(way,elements))
		} else if (member.type=='relation') {
			skippedRelationIds.add(member.ref)
		}
	}
	return [layer,skippedRelationIds]
}

function makeOsmChangesetLayer(changeset: OsmChangesetApiData, options: L.PolylineOptions = {color:'#000'}): L.Layer|null {
	if (!hasBbox(changeset)) return null
	return L.rectangle([
		[changeset.minlat,changeset.minlon],
		[changeset.maxlat,changeset.maxlon]
	],options)
}

function makeAdiffNodeLayer(node: OsmAdiffNodeElement, color: string): L.Layer {
	if (!node.visible) throw new TypeError(`unexpected deleted node`)
	return L.circleMarker(
		[node.lat,node.lon],
		{radius:3,color,opacity:.2,fillOpacity:1}
	)
}
function makeAdiffWayLayer(way: OsmAdiffWayElement, color: string): L.Layer {
	if (!way.visible) throw new TypeError(`unexpected deleted way`)
	const coords: L.LatLngExpression[] = way.nodeRefs.map(([,lat,lon])=>[lat,lon])
	return L.polyline(coords,{weight:2,color})
}
