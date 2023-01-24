import {Tool, ToolFitMode, ToolCallbacks} from './tools/base'
import * as UtilTools from './tools/util'
import {RefreshTool} from './tools/refresh'
import {ParseTool} from './tools/parse'
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
	()=>new InteractTool,
	()=>new UtilTools.AutozoomTool, ()=>new UtilTools.CommentsTool, ()=>new RefreshTool,
	()=>new UtilTools.TimestampTool, ()=>new ParseTool,
	()=>new OverpassTurboTool, ()=>new OverpassTool,
	()=>new EditorTools.RcTool, ()=>new EditorTools.IdTool,
	()=>new ExportTools.GpxTool, ()=>new ExportTools.GeoJsonTool,
	()=>new YandexPanoramasTool, ()=>new MapillaryTool,
	()=>new UtilTools.CountTool, ()=>new UtilTools.LegendTool, ()=>new UtilTools.SettingsTool
]
