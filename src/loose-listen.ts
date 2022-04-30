export default class LooseParserListener {
	private x: number|undefined
	private y: number|undefined
	private hadSelectionOnMouseDown: boolean = false
	private mouseDownListener: (this: HTMLElement, ev: MouseEvent) => void
	private mouseUpListener: (this: HTMLElement, ev: MouseEvent) => void
	constructor(callback: (x:number,y:number,text:string)=>void) {
		const that=this
		this.mouseDownListener=function(ev: MouseEvent){
			that.x=ev.pageX
			that.y=ev.pageY
			that.hadSelectionOnMouseDown=!!getValidSelection()?.toString()
		}
		this.mouseUpListener=function(ev: MouseEvent){
			const samePlace=that.x==ev.pageX && that.y==ev.pageY
			that.x=that.y=undefined
			if (samePlace && that.hadSelectionOnMouseDown) return // had something selected and made a single click
			const selectedText=getExtendedSelectionText(this,samePlace) // need to extend the selected text when the selection is a result of a double-click
			if (!selectedText) return
			callback(ev.pageX,ev.pageY,selectedText)
		}
		function getValidSelection(): Selection|null {
			const selection=document.getSelection()
			if (!selection) return null
			if (selection.rangeCount!=1) return null
			return selection
		}
		function getExtendedSelectionText(startNode: Node, needToExtend: boolean): string {
			const selection=getValidSelection()
			if (!selection) return ''
			const selectionText=selection.toString()
			if (!needToExtend || !selectionText) return selectionText
			if (
				selection.anchorNode==null || selection.anchorOffset==null ||
				selection.focusNode==null  || selection.focusOffset==null
			) return ''
			const t1=getExtendedSelectionTextToNodeAndOffset(startNode,selection.anchorNode,selection.anchorOffset)
			const t2=getExtendedSelectionTextToNodeAndOffset(startNode,selection.focusNode,selection.focusOffset)
			if (t1.length>t2.length) {
				return t1
			} else {
				return t2
			}
		}
		function getExtendedSelectionTextToNodeAndOffset(startNode: Node, node: Node, offset: number): string {
			const range=document.createRange()
			range.setStart(startNode,0)
			range.setEnd(node,offset)
			return range.toString()
		}
	}
	listen($target: HTMLElement) {
		$target.addEventListener('mousedown',this.mouseDownListener)
		$target.addEventListener('mouseup',this.mouseUpListener)
	}
}
