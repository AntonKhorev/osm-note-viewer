import type {ApiFetcher} from './server'
import {isNoteFeature, transformFeatureToNotesAndUsers, getNoteUpdateDate} from './data'
import {makeEscapeTag} from './escape'

const e=makeEscapeTag(encodeURIComponent)
const clamp=(min:number,value:number,max:number)=>Math.max(min,Math.min(value,max))

interface TimeoutCaller {
	cancelScheduledCall: ()=>void
	schedulePeriodicCall:  (callback:(timestamp:number)=>void)=>void
	scheduleImmediateCall: (callback:(timestamp:number)=>void)=>void
}

type ScheduleEntry = {
	refreshTimestamp:number
	updateDate:number
	needImmediateRefresh:boolean
	hasPendingUpdate:boolean
}

export default class NoteRefresher {
	private isRunning=true
	schedule=new Map<number,ScheduleEntry>()
	constructor(
		private refreshPeriod:number,
		private apiFetcher:ApiFetcher,
		private timeoutCaller:TimeoutCaller,
		private reportRefreshWaitProgress:(id:number,progress:number)=>void,
		private reportUpdate:(id:number)=>void,
		private reportPostpone:(id:number,message?:string)=>number
	) {
		this.timeoutCaller.schedulePeriodicCall((timestamp)=>this.receiveScheduledCall(timestamp))
	}
	run() {
		if (this.isRunning) return
		this.isRunning=true
		this.timeoutCaller.schedulePeriodicCall((timestamp)=>this.receiveScheduledCall(timestamp))
	}
	stop() {
		if (!this.isRunning) return
		this.isRunning=false
		this.timeoutCaller.cancelScheduledCall()
	}
	reset() {
		this.schedule.clear()
	}
	refreshAll():void {
		for (const scheduleEntry of this.schedule.values()) {
			scheduleEntry.needImmediateRefresh=true
		}
		this.timeoutCaller.scheduleImmediateCall((timestamp)=>this.receiveScheduledCall(timestamp))
	}
	observe(noteRefreshList:[id:number,refreshTimestamp:number,updateDate:number,hasPendingUpdate:boolean][]):void {
		const notesToUnschedule=new Set(this.schedule.keys())
		for (const [id,refreshTimestamp,updateDate,hasPendingUpdate] of noteRefreshList) {
			notesToUnschedule.delete(id)
			const entry=this.schedule.get(id)
			if (entry) {
				entry.refreshTimestamp=refreshTimestamp
			} else {
				this.schedule.set(id,{
					refreshTimestamp,
					updateDate,
					hasPendingUpdate,
					needImmediateRefresh:false
				})
			}
		}
		for (const id of notesToUnschedule) {
			this.schedule.delete(id)
		}
	}
	update(id:number,refreshTimestamp:number,updateDate:number):void {
		const entry=this.schedule.get(id)
		if (!entry) return
		entry.refreshTimestamp=refreshTimestamp
		entry.updateDate=updateDate
		entry.hasPendingUpdate=false
		entry.needImmediateRefresh=false
	}
	private async receiveScheduledCall(timestamp:number) {
		const reportAllProgress=()=>{
			for (const [id,{refreshTimestamp,hasPendingUpdate}] of this.schedule) {
				if (hasPendingUpdate) {
					this.reportRefreshWaitProgress(id,1)
				} else {
					const progress=clamp(0,(timestamp-refreshTimestamp)/this.refreshPeriod,1)
					this.reportRefreshWaitProgress(id,progress)
				}
			}
		}
		const getNextId=()=>{
			let earliestRefreshTimestamp=+Infinity
			let earliestRefreshId
			for (const [id,{refreshTimestamp,needImmediateRefresh,hasPendingUpdate}] of this.schedule) {
				if (hasPendingUpdate) continue
				if (needImmediateRefresh) {
					return id
				}
				if (earliestRefreshTimestamp>refreshTimestamp) {
					earliestRefreshTimestamp=refreshTimestamp
					earliestRefreshId=id
				}
			}
			if (timestamp-earliestRefreshTimestamp>=this.refreshPeriod) {
				return earliestRefreshId
			}
		}
		reportAllProgress()
		const currentId=getNextId()
		if (currentId==null) {
			if (this.isRunning) {
				this.timeoutCaller.schedulePeriodicCall((timestamp)=>this.receiveScheduledCall(timestamp))
			}
			return
		}
		await this.fetch(timestamp,currentId)
		const futureId=getNextId()
		if (futureId) {
			this.timeoutCaller.scheduleImmediateCall((timestamp)=>this.receiveScheduledCall(timestamp))
		} else if (this.isRunning) {
			this.timeoutCaller.schedulePeriodicCall((timestamp)=>this.receiveScheduledCall(timestamp))
		}
	}
	private async fetch(timestamp:number,id:number) {
		const scheduleEntry=this.schedule.get(id)
		if (!scheduleEntry) return
		const postpone=(message?:string):void=>{
			const newRefreshTimestamp=this.reportPostpone(id,message)
			scheduleEntry.refreshTimestamp=newRefreshTimestamp
		}
		scheduleEntry.needImmediateRefresh=false
		// const progress=clamp(0,(timestamp-scheduleEntry.refreshTimestamp)/this.refreshPeriod,1)
		scheduleEntry.refreshTimestamp=timestamp
		// this.reportRefreshWaitProgress(id,progress)
		const apiPath=e`notes/${id}.json`
		const response=await this.apiFetcher.apiFetch(apiPath)
		if (!response.ok) return postpone(`note refresh failed`)
		const data=await response.json()
		if (!isNoteFeature(data)) return postpone(`note refresh received invalid data`)
		const [newNotes]=transformFeatureToNotesAndUsers(data)
		if (newNotes.length!=1) return postpone(`note refresh received unexpected number of notes`)
		const [newNote]=newNotes
		if (newNote.id!=id) return postpone(`note refresh received unexpected note`)
		const newUpdateDate=getNoteUpdateDate(newNote)
		if (newUpdateDate<=scheduleEntry.updateDate) return postpone()
		scheduleEntry.hasPendingUpdate=true
		this.reportUpdate(id)
	}
}
