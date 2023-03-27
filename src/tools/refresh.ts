import {Tool, ToolElements, makeActionIcon} from './base'
import type {Note, Users} from '../data'
import {getNoteUpdateDate} from '../data'
import fetchTableNote, {getFetchTableNoteErrorMessage} from '../fetch-note'
import {bubbleCustomEvent} from '../util/events'
import {makeElement, makeLabel} from '../util/html'
import RefreshToolScheduler from './refresh-scheduler'

export class RefreshTool extends Tool {
	id='refresh'
	name=`Refresh`
	title=`Control automatic and manual refreshing of notes`
	protected getTool($root: HTMLElement, $tool: HTMLElement): ToolElements {
		const $runButton=makeElement('button')('only-with-icon')()
		const $refreshPeriodInput=document.createElement('input')
		const isOnlineAndVisibleAtLaunch=navigator.onLine && document.visibilityState=='visible'
		let stoppedBecauseOfflineOrHidden=!isOnlineAndVisibleAtLaunch

		const defaultRefreshPeriodInMinutes=5
		const noteRefreshTimestampsById = new Map<number,number>()
		const notesWithPendingUpdate = new Set<number>()
		const scheduler=new RefreshToolScheduler(
			isOnlineAndVisibleAtLaunch,
			defaultRefreshPeriodInMinutes*60*1000,
			makeTimeoutCaller(10*1000,100),
			(id,progress)=>{
				bubbleCustomEvent($tool,'osmNoteViewer:noteRefreshWaitProgress',[id,progress])
			},
			(note,users)=>{
				if ($refreshSelect.value=='replace') {
					bubbleCustomEvent($tool,'osmNoteViewer:noteUpdatePush',[note,users])
				} else {
					notesWithPendingUpdate.add(note.id)
				}
			},
			(id,message)=>{
				bubbleCustomEvent($tool,'osmNoteViewer:noteRefreshWaitProgress',[id,0])
				const refreshTimestamp=Date.now()
				noteRefreshTimestampsById.set(id,refreshTimestamp)
				return refreshTimestamp
			},
			(message)=>{
				updateUiWithState(message)
				this.ping($tool)
			},
			async(id)=>{
				bubbleCustomEvent($tool,'osmNoteViewer:beforeNoteFetch',id)
				let note: Note
				let users: Users
				try {
					[note,users]=await fetchTableNote(this.auth.server.api,id,this.auth.token)
				} catch (ex) {
					bubbleCustomEvent($tool,'osmNoteViewer:failedNoteFetch',[id,getFetchTableNoteErrorMessage(ex)])
					throw ex
				}
				bubbleCustomEvent($tool,'osmNoteViewer:noteFetch',[note,users])
				return [note,users]
			}
		)
		const updateUiWithState=(message?:string)=>{
			stoppedBecauseOfflineOrHidden=false // TODO this is not an ui update
			if (message==null) {
				$runButton.classList.remove('error')
				$runButton.title=(scheduler.isRunning?`Halt`:`Resume`)+` note auto refreshing`
			} else {
				$runButton.classList.add('error')
				$runButton.title=message
			}
			$runButton.replaceChildren(scheduler.isRunning
				? makeActionIcon('pause',`Halt`)
				: makeActionIcon('play',`Resume`)
			)
		}
		const getHaltMessage=()=>(!navigator.onLine
			? `Refreshes halted in offline mode`
			: `Refreshes halted while the browser window is hidden`
		)+`. Click to attempt to resume.`

		const $refreshSelect=makeElement('select')()(
			new Option('report'),
			new Option('replace')
		)
		$refreshPeriodInput.type='number'
		$refreshPeriodInput.min='1'
		$refreshPeriodInput.size=5
		$refreshPeriodInput.step='any'
		$refreshPeriodInput.value=String(defaultRefreshPeriodInMinutes)
		const $refreshAllButton=makeElement('button')('only-with-icon')(makeActionIcon('refresh',`Refresh now`))
		$refreshAllButton.title=`Refresh all notes currently on the screen in the table above`
		$runButton.onclick=()=>{
			scheduler.setRunState(!scheduler.isRunning)
			stoppedBecauseOfflineOrHidden=false
			updateUiWithState()
		}
		$refreshPeriodInput.oninput=()=>{
			const str=$refreshPeriodInput.value
			if (!str) return
			const minutes=Number(str)
			if (!Number.isFinite(minutes) || minutes<=0) return
			scheduler.setPeriod(minutes*60*1000)
		}
		$refreshAllButton.onclick=()=>{
			scheduler.refreshAll($refreshSelect.value=='replace')
		}
		$root.addEventListener('osmNoteViewer:newNoteStream',()=>{
			scheduler.reset()
			noteRefreshTimestampsById.clear()
			notesWithPendingUpdate.clear()
		})
		$root.addEventListener('osmNoteViewer:notesInViewportChange',ev=>{
			const notes=ev.detail
			const noteRefreshList:[id:number,lastRefreshTimestamp:number,updateDate:number,hasPendingUpdate:boolean][]=[]
			for (const note of notes) {
				const lastRefreshTimestamp=noteRefreshTimestampsById.get(note.id)
				if (!lastRefreshTimestamp) continue
				noteRefreshList.push([note.id,lastRefreshTimestamp,getNoteUpdateDate(note),notesWithPendingUpdate.has(note.id)])
			}
			scheduler.observe(noteRefreshList)
		})
		$root.addEventListener('osmNoteViewer:noteRender',({detail:note})=>{
			notesWithPendingUpdate.delete(note.id)
			noteRefreshTimestampsById.set(note.id,Date.now())
			scheduler.replaceNote(note.id,Date.now(),getNoteUpdateDate(note))
		})

		if (isOnlineAndVisibleAtLaunch) {
			updateUiWithState()
		} else {
			updateUiWithState(getHaltMessage())
		}
		const handleTemporaryHaltConditions=()=>{
			if (navigator.onLine && document.visibilityState=='visible') {
				if (!stoppedBecauseOfflineOrHidden) return
				stoppedBecauseOfflineOrHidden=false
				scheduler.setRunState(true)
				updateUiWithState()
			} else {
				if (!scheduler.isRunning) return
				scheduler.setRunState(false)
				updateUiWithState(getHaltMessage())
				stoppedBecauseOfflineOrHidden=true
			}
		}
		window.addEventListener('offline',handleTemporaryHaltConditions)
		window.addEventListener('online',handleTemporaryHaltConditions)
		document.addEventListener('visibilitychange',handleTemporaryHaltConditions)

		return [
			$runButton,` `,
			makeLabel('inline')($refreshSelect,` updated notes`),` `,
			makeLabel('inline')(`every `,$refreshPeriodInput),` min. or `,
			$refreshAllButton
		]
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
