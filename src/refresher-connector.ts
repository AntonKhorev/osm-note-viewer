import type {Note, Users} from './data'
import {getNoteUpdateDate} from './data'
import NoteRefresher from './refresher'
import type ToolPanel from './tool-panel'
import {bubbleCustomEvent} from './html'

export default class NoteTableAndRefresherConnector {
	private noteRefresher: NoteRefresher
	private noteRefreshTimestampsById = new Map<number,number>()
	private notesWithPendingUpdate = new Set<number>()
	constructor(
		$root: HTMLElement, $table: HTMLTableElement,
		toolPanel: ToolPanel,
		setNoteProgress: (id:number,progress:number)=>void,
		setNoteUpdatedState: (id:number)=>void,
		updateNote: (note:Note,users:Users)=>void,
		fetchSingleNote: (id:number)=>Promise<[note:Note,users:Users]>
	) {
		const isOnlineAndVisible=navigator.onLine && document.visibilityState=='visible'
		const refreshPeriod=5*60*1000
		this.noteRefresher=new NoteRefresher(
			isOnlineAndVisible,refreshPeriod,makeTimeoutCaller(10*1000,100),
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
				bubbleCustomEvent($table,'osmNoteViewer:changeRefresherState',[false,message])
			},
			fetchSingleNote
		)
		let stoppedBecauseOfflineOrHidden=!isOnlineAndVisible
		toolPanel.onRefresherRefreshAll=()=>this.noteRefresher.refreshAll(toolPanel.replaceUpdatedNotes)
		toolPanel.onRefresherPeriodChange=(refreshPeriod)=>this.noteRefresher.setPeriod(refreshPeriod)
		toolPanel.receiveRefresherPeriodChange(refreshPeriod)
		const getHaltMessage=()=>(!navigator.onLine
			? `Refreshes halted in offline mode`
			: `Refreshes halted while the browser window is hidden`
		)+`. Click to attempt to resume.`
		if (!isOnlineAndVisible) {
			bubbleCustomEvent($table,'osmNoteViewer:changeRefresherState',[false,getHaltMessage()])
		}
		const handleTemporaryHaltConditions=()=>{
			if (navigator.onLine && document.visibilityState=='visible') {
				if (!stoppedBecauseOfflineOrHidden) return
				stoppedBecauseOfflineOrHidden=false
				this.noteRefresher.setRunState(true)
				bubbleCustomEvent($table,'osmNoteViewer:changeRefresherState',[true,undefined])
			} else {
				if (!this.noteRefresher.isRunning) return
				this.noteRefresher.setRunState(false)
				bubbleCustomEvent($table,'osmNoteViewer:changeRefresherState',[false,getHaltMessage()])
				stoppedBecauseOfflineOrHidden=true
			}
		}
		window.addEventListener('offline',handleTemporaryHaltConditions)
		window.addEventListener('online',handleTemporaryHaltConditions)
		document.addEventListener('visibilitychange',handleTemporaryHaltConditions)
		$root.addEventListener('osmNoteViewer:changeRefresherState',ev=>{
			if (ev.target==$table) return
			const [isRunning]=ev.detail
			this.noteRefresher.setRunState(isRunning)
			stoppedBecauseOfflineOrHidden=false
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
