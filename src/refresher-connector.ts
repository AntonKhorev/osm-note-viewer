import {Note, Users, getNoteUpdateDate} from './data'
import NoteRefresher from './refresher'
import ToolPanel from './tool-panel'

export default class NoteTableAndRefresherConnector {
	private noteRefresher: NoteRefresher
	private noteRefreshTimestampsById = new Map<number,number>()
	private notesWithPendingUpdate = new Set<number>()
	constructor(
		toolPanel: ToolPanel,
		setNoteProgress: (id:number,progress:number)=>void,
		setNoteUpdatedState: (id:number)=>void,
		updateNote: (note:Note,users:Users)=>void,
		fetchSingleNote: (id:number)=>Promise<[note:Note,users:Users]>
	) {
		const isOnline=navigator.onLine
		const refreshPeriod=5*60*1000
		this.noteRefresher=new NoteRefresher(
			isOnline,refreshPeriod,makeTimeoutCaller(10*1000,100),
			setNoteProgress,
			(note,users)=>{
				if (toolPanel.replaceUpdatedNotes) {
					updateNote(note,users)
				} else {
					setNoteUpdatedState(note.id)
					this.notesWithPendingUpdate.add(note.id)
				}
			},
			(id:number,message?:string)=>{
				setNoteProgress(id,0)
				const refreshTimestamp=Date.now()
				this.noteRefreshTimestampsById.set(id,refreshTimestamp)
				return refreshTimestamp
			},
			(message:string)=>{
				toolPanel.receiveRefresherStateChange(false,message)
			},
			fetchSingleNote
		)
		let stoppedBecauseOffline=!isOnline
		toolPanel.onRefresherStateChange=(isRunning)=>{
			this.noteRefresher.setRunState(isRunning)
			stoppedBecauseOffline=false
		}
		toolPanel.onRefresherRefreshAll=()=>this.noteRefresher.refreshAll(toolPanel.replaceUpdatedNotes)
		toolPanel.onRefresherPeriodChange=(refreshPeriod)=>this.noteRefresher.setPeriod(refreshPeriod)
		toolPanel.receiveRefresherPeriodChange(refreshPeriod)
		if (!isOnline) {
			toolPanel.receiveRefresherStateChange(false,undefined)
		}
		window.addEventListener('offline',()=>{
			if (!this.noteRefresher.isRunning) return
			this.noteRefresher.setRunState(false)
			toolPanel.receiveRefresherStateChange(false,`refreshes stopped in offline mode`)
			stoppedBecauseOffline=true
		})
		window.addEventListener('online',()=>{
			if (!stoppedBecauseOffline) return
			stoppedBecauseOffline=false
			this.noteRefresher.setRunState(true)
			toolPanel.receiveRefresherStateChange(true,undefined)
		})
	}
	reset(): void {
		this.noteRefresher.reset()
		this.noteRefreshTimestampsById.clear()
		this.notesWithPendingUpdate.clear()
	}
	observeNotesByRefresher(notes: Note[]) {
		const noteRefreshList:[id:number,lastRefreshTimestamp:number,updateDate:number,hasPendingUpdate:boolean][]=[]
		for (const note of notes) {
			const lastRefreshTimestamp=this.noteRefreshTimestampsById.get(note.id)
			if (!lastRefreshTimestamp) continue
			noteRefreshList.push([note.id,lastRefreshTimestamp,getNoteUpdateDate(note),this.notesWithPendingUpdate.has(note.id)])
		}
		this.noteRefresher.observe(noteRefreshList)
	}
	registerNote(note: Note) {
		this.notesWithPendingUpdate.delete(note.id)
		this.noteRefreshTimestampsById.set(note.id,Date.now())
		this.noteRefresher.replaceNote(note.id,Date.now(),getNoteUpdateDate(note))
	}
}

function makeTimeoutCaller(periodicCallDelay:number,immediateCallDelay:number) {
	let timeoutId:number|undefined
	const scheduleCall=(delay:number)=>(callback:(timestamp:number)=>void)=>{
		clearTimeout(timeoutId)
		timeoutId=setTimeout(()=>callback(Date.now()),delay)
	}
	return {
		cancelScheduledCall() {
			clearTimeout(timeoutId)
		},
		schedulePeriodicCall:  scheduleCall(periodicCallDelay),
		scheduleImmediateCall: scheduleCall(immediateCallDelay),
	}
}
