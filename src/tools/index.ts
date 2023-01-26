import {Tool, ToolFitMode, ToolCallbacks} from './base'
import * as UtilTools from './util'
import {RefreshTool} from './refresh'
import {ParseTool} from './parse'
import {OverpassTurboTool, OverpassTool} from './overpass'
import * as EditorTools from './editor'
import * as ExportTools from './export'
import {StreetViewTool, YandexPanoramasTool, MapillaryTool} from './streetview'
import {InteractTool} from './interact'
import {ReportTool} from './report'

export {
	Tool, ToolFitMode, ToolCallbacks,
	OverpassTurboTool, OverpassTool, StreetViewTool
}

export const toolMakerSequence: Array<()=>Tool> = [
	()=>new InteractTool, ()=>new ReportTool,
	()=>new UtilTools.AutozoomTool, ()=>new UtilTools.CommentsTool, ()=>new RefreshTool,
	()=>new UtilTools.TimestampTool, ()=>new ParseTool,
	()=>new OverpassTurboTool, ()=>new OverpassTool,
	()=>new EditorTools.RcTool, ()=>new EditorTools.IdTool,
	()=>new ExportTools.GpxTool, ()=>new ExportTools.GeoJsonTool,
	()=>new YandexPanoramasTool, ()=>new MapillaryTool,
	()=>new UtilTools.CountTool, ()=>new UtilTools.LegendTool, ()=>new UtilTools.SettingsTool
]
