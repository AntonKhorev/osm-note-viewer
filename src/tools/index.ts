import {Tool} from './base'
import * as UtilTools from './util'
import {InteractTool} from './interact'
import {ReportTool} from './report'
import {RefreshTool} from './refresh'
import {ParseTool} from './parse'
import {ChangesetTool} from './changeset'
import {OverpassTurboTool, OverpassTool} from './overpass'
import * as EditorTools from './editor'
import * as ExportTools from './export'
import {YandexPanoramasTool, MapillaryTool} from './streetview'
import type {SimpleStorage} from '../util/storage'
import type {Connection} from '../net'

export {Tool}

export const toolMakerSequence: Array<(storage:SimpleStorage,cx:Connection)=>Tool> = [
	InteractTool, ReportTool, RefreshTool,
	UtilTools.AutozoomTool, UtilTools.TimestampTool, ParseTool,
	ChangesetTool, OverpassTurboTool, OverpassTool,
	EditorTools.RcTool, EditorTools.IdTool, UtilTools.GeoUriTool,
	ExportTools.GpxTool, ExportTools.GeoJsonTool,
	YandexPanoramasTool, MapillaryTool,
	UtilTools.CountTool, UtilTools.LegendTool
].map(ToolClass=>(storage,cx)=>new ToolClass(storage,cx))
