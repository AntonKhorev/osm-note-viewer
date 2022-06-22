import {Tool, ToolFitMode, ToolCallbacks} from './tools/base'
import * as UtilTools from './tools/util'
import * as OverpassTools from './tools/overpass'
import * as EditorTools from './tools/editor'
import * as ExportTools from './tools/export'
import * as StreetViewTools from './tools/streetview'

export {Tool, ToolFitMode, ToolCallbacks}

export const toolMakerSequence: Array<()=>Tool> = [
	()=>new UtilTools.AutozoomTool, ()=>new UtilTools.TimestampTool, ()=>new UtilTools.ParseTool,
	()=>new OverpassTools.OverpassTurboTool, ()=>new OverpassTools.OverpassDirectTool,
	()=>new EditorTools.RcTool, ()=>new EditorTools.IdTool,
	()=>new ExportTools.GpxTool, ()=>new ExportTools.GeoJsonTool,
	()=>new StreetViewTools.YandexPanoramasTool, ()=>new StreetViewTools.MapillaryTool,
	()=>new UtilTools.CountTool, ()=>new UtilTools.LegendTool, ()=>new UtilTools.SettingsTool
]
