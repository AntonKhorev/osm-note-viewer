import {Note, Users, getNoteUpdateDate} from './data'
import {NoteDataError} from './fetch-note'

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
	private schedule=new Map<number,ScheduleEntry>()
	constructor(
		public isRunning: boolean,
		private refreshPeriod: number,
		private timeoutCaller: TimeoutCaller,
		private reportRefreshWaitProgress: (id:number,progress:number)=>void,
		private reportUpdate: (note:Note,users:Users)=>void,
		private reportPostpone: (id:number,message?:string)=>number,
		private reportHalt: (message:string)=>void,
		private fetchSingleNote: (id:number)=>Promise<[note:Note,users:Users]>
	) {
		if (isRunning) {
			this.timeoutCaller.schedulePeriodicCall((timestamp)=>this.receiveScheduledCall(timestamp))
		}
	}
	setPeriod(refreshPeriod:number):void {
		this.refreshPeriod=refreshPeriod
		// TODO update progress bars
	}
	setRunState(isRunning:boolean):void {
		if (isRunning==this.isRunning) return
		this.isRunning=isRunning
		if (isRunning) {
			this.timeoutCaller.schedulePeriodicCall((timestamp)=>this.receiveScheduledCall(timestamp))
		} else {
			this.timeoutCaller.cancelScheduledCall()
		}
	}
	reset():void {
		this.schedule.clear()
	}
	refreshAll(alsoRefreshNotesWithRendingUpdate:boolean):void {
		for (const scheduleEntry of this.schedule.values()) {
			scheduleEntry.needImmediateRefresh=(
				alsoRefreshNotesWithRendingUpdate ||
				!scheduleEntry.hasPendingUpdate
			)
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
	replaceNote(id:number,refreshTimestamp:number,updateDate:number):void {
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
				if (needImmediateRefresh) {
					return id
				}
				if (hasPendingUpdate) continue
				if (earliestRefreshTimestamp>refreshTimestamp) {
					earliestRefreshTimestamp=refreshTimestamp
					earliestRefreshId=id
				}
			}
			if (timestamp-earliestRefreshTimestamp>=this.refreshPeriod) {
				return earliestRefreshId
			}
		}
		let currentId: number|undefined
		let futureId: number|undefined
		try {
			reportAllProgress()
			currentId=getNextId()
			if (currentId!=null) {
				await this.fetch(timestamp,currentId)
				futureId=getNextId()
			}
		} catch (ex) {
			this.isRunning=false
			let message=`unknown error`
			if (ex instanceof Error) {
				message=ex.message
			}
			this.reportHalt(message)
			return
		}
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
		scheduleEntry.refreshTimestamp=timestamp
		try {
			const [newNote,newUsers]=await this.fetchSingleNote(id)
			const newUpdateDate=getNoteUpdateDate(newNote)
			if (newUpdateDate<=scheduleEntry.updateDate) return postpone()
			scheduleEntry.hasPendingUpdate=true
			this.reportUpdate(newNote,newUsers)
		} catch (ex) {
			if (ex instanceof NoteDataError) {
				return postpone(ex.message)
			} else {
				throw ex
			}
		}
	}
}
