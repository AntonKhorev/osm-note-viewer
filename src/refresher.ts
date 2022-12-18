interface ApiFetcher {
	apiFetch(requestPath:string):Promise<Response>
}

type ScheduleEntry = {
	lastRefreshTimestamp:number
	needImmediateUpdate:boolean
}

export default class NoteRefresher {
	schedule=new Map<number,ScheduleEntry>()
	constructor(
		private noteRefreshPeriod:number,
		private apiFetcher:ApiFetcher
	) {}
	reset() {
		this.schedule.clear()
	}
	poll(timestamp:number):void {
		// TODO find earliest note
	}
	refreshAll():void {
	}
	observe(noteRefreshList:[id:number,lastUpdateTimestamp:number][]):void {
		const notesToUnschedule=new Set(this.schedule.keys())
		for (const [id,lastRefreshTimestamp] of noteRefreshList) {
			notesToUnschedule.delete(id)
			const entry=this.schedule.get(id)
			if (entry) {
				entry.lastRefreshTimestamp=lastRefreshTimestamp
			} else {
				this.schedule.set(id,{
					lastRefreshTimestamp: lastRefreshTimestamp,
					needImmediateUpdate:false
				})
			}
		}
		console.log('scheduled note updates',noteRefreshList)
	}
}
