import {Tool, ToolFitMode, ToolCallbacks} from './base'
import * as UtilTools from './util'
import {InteractTool} from './interact'
import {ReportTool} from './report'
import {RefreshTool} from './refresh'
import {ParseTool} from './parse'
import {OverpassTurboTool, OverpassTool} from './overpass'
import * as EditorTools from './editor'
import * as ExportTools from './export'
import {YandexPanoramasTool, MapillaryTool} from './streetview'
import Auth from '../auth'

export {Tool, ToolFitMode, ToolCallbacks}

export const toolMakerSequence: Array<(auth:Auth)=>Tool> = [
	InteractTool, ReportTool, RefreshTool,
	UtilTools.AutozoomTool, UtilTools.TimestampTool, ParseTool,
	OverpassTurboTool, OverpassTool,
	EditorTools.RcTool, EditorTools.IdTool,
	ExportTools.GpxTool, ExportTools.GeoJsonTool,
	YandexPanoramasTool, MapillaryTool,
	UtilTools.CountTool, UtilTools.LegendTool, UtilTools.SettingsTool
].map(ToolClass=>(auth)=>new ToolClass(auth))
