import {Tool, ToolFitMode, ToolCallbacks} from './tools/base'
import * as UtilTools from './tools/util'
import * as OverpassTools from './tools/overpass'
import * as EditorTools from './tools/editor'
import * as ExportTools from './tools/export'
import * as StreetViewTools from './tools/streetview'
import Server from './server'

export {Tool, ToolFitMode, ToolCallbacks}

export const toolMakerSequence: Array<(server:Server)=>Tool> = [
	()=>new UtilTools.AutozoomTool, ()=>new UtilTools.CommentsTool,
	()=>new UtilTools.TimestampTool, ()=>new UtilTools.ParseTool,
	()=>new OverpassTools.OverpassTurboTool, ()=>new OverpassTools.OverpassDirectTool,
	()=>new EditorTools.RcTool, ()=>new EditorTools.IdTool,
	(server)=>new ExportTools.GpxTool(server), (server)=>new ExportTools.GeoJsonTool(server),
	()=>new StreetViewTools.YandexPanoramasTool, ()=>new StreetViewTools.MapillaryTool,
	()=>new UtilTools.CountTool, ()=>new UtilTools.LegendTool, ()=>new UtilTools.SettingsTool
]
