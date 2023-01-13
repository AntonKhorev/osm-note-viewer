import {Tool, ToolFitMode, ToolCallbacks} from './tools/base'
import * as UtilTools from './tools/util'
import {OverpassTurboTool, OverpassTool} from './tools/overpass'
import * as EditorTools from './tools/editor'
import * as ExportTools from './tools/export'
import {StreetViewTool, YandexPanoramasTool, MapillaryTool} from './tools/streetview'
import {InteractTool} from './tools/interact'

export {
	Tool, ToolFitMode, ToolCallbacks,
	OverpassTurboTool, OverpassTool, StreetViewTool
}

export const toolMakerSequence: Array<()=>Tool> = [
	()=>new UtilTools.AutozoomTool, ()=>new UtilTools.CommentsTool, ()=>new UtilTools.RefreshTool,
	()=>new UtilTools.TimestampTool, ()=>new UtilTools.ParseTool,
	()=>new OverpassTurboTool, ()=>new OverpassTool,
	()=>new EditorTools.RcTool, ()=>new EditorTools.IdTool,
	()=>new ExportTools.GpxTool, ()=>new ExportTools.GeoJsonTool,
	()=>new YandexPanoramasTool, ()=>new MapillaryTool,
	()=>new InteractTool,
	()=>new UtilTools.CountTool, ()=>new UtilTools.LegendTool, ()=>new UtilTools.SettingsTool
]
