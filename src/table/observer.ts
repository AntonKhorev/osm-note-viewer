export default class NoteSectionVisibilityObserver {
	private intersectionObserver: IntersectionObserver|undefined
	private visibilityTimeoutId: number | undefined
	private haltingTimeoutId: number | undefined
	private isMapFittingHalted: boolean = false
	private noteIdVisibility = new Map<number,boolean>()
	private intersectionObserverCallback: IntersectionObserverCallback
	public stickyHeight=0
	constructor(handleVisibleNotes: (visibleNoteIds:number[],isMapFittingHalted:boolean)=>void) {
		const noteSectionVisibilityHandler=()=>{
			const visibleNoteIds: number[] = []
			for (const [noteId,visibility] of this.noteIdVisibility) {
				if (visibility) visibleNoteIds.push(noteId)
			}
			handleVisibleNotes(visibleNoteIds,this.isMapFittingHalted)
		}
		this.intersectionObserverCallback=(entries)=>{
			for (const entry of entries) {
				const $noteSection=entry.target
				if (!($noteSection instanceof HTMLElement)) continue
				if (!$noteSection.dataset.noteId) continue
				const noteId=Number($noteSection.dataset.noteId)
				if (!this.noteIdVisibility.has(noteId)) continue
				this.noteIdVisibility.set(noteId,entry.isIntersecting)
			}
			clearTimeout(this.visibilityTimeoutId)
			this.visibilityTimeoutId=setTimeout(noteSectionVisibilityHandler)
		}
	}
	observe($noteSection: HTMLTableSectionElement): void {
		if (!this.intersectionObserver) {
			this.intersectionObserver=new IntersectionObserver(this.intersectionObserverCallback,{
				rootMargin: `-${this.stickyHeight}px 0px 0px 0px`
			})
		}
		if (!$noteSection.dataset.noteId) return
		const noteId=Number($noteSection.dataset.noteId)
		this.noteIdVisibility.set(noteId,false)
		this.intersectionObserver.observe($noteSection)
	}
	disconnect() {
		if (this.intersectionObserver) {
			this.intersectionObserver.disconnect()
			this.intersectionObserver=undefined
		}
		this.noteIdVisibility.clear()
	}
	haltMapFitting(): void {
		clearTimeout(this.visibilityTimeoutId)
		clearTimeout(this.haltingTimeoutId)
		this.isMapFittingHalted=true
		this.haltingTimeoutId=setTimeout(()=>{
			this.isMapFittingHalted=false
		},100)
	}
}
