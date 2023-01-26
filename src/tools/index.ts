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
import Auth from '../auth'

export {
	Tool, ToolFitMode, ToolCallbacks,
	OverpassTurboTool, OverpassTool, StreetViewTool
}

export const toolMakerSequence: Array<(auth:Auth)=>Tool> = [
	InteractTool, ReportTool,
	UtilTools.AutozoomTool, UtilTools.CommentsTool, RefreshTool,
	UtilTools.TimestampTool, ParseTool,
	OverpassTurboTool, OverpassTool,
	EditorTools.RcTool, EditorTools.IdTool,
	ExportTools.GpxTool, ExportTools.GeoJsonTool,
	YandexPanoramasTool, MapillaryTool,
	UtilTools.CountTool, UtilTools.LegendTool, UtilTools.SettingsTool
].map(ToolClass=>(auth)=>new ToolClass(auth))
