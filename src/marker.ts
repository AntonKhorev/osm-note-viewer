import type {Note, NoteComment} from './data'
import {escapeXml, makeEscapeTag} from './escape'

const e=makeEscapeTag(escapeXml)

export default class NoteMarker extends L.Marker {
	noteId: number
	constructor(note: Note) {
		const icon=getNoteMarkerIcon(note,false)
		super([note.lat,note.lon],{icon})
		this.noteId=note.id
	}
	updateIcon(note: Note, isSelected: boolean) {
		const icon=getNoteMarkerIcon(note,isSelected)
		this.setIcon(icon)
	}
}

function getNoteMarkerIcon(note: Note, isSelected: boolean): L.DivIcon {
	const width=25
	const height=40
	const auraThickness=4
	const r=width/2
	const widthWithAura=width+auraThickness*2
	const heightWithAura=height+auraThickness
	const rWithAura=widthWithAura/2
	const nInnerCircles=4
	let html=``
	html+=e`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-rWithAura} ${-rWithAura} ${widthWithAura} ${heightWithAura}">`
	html+=e`<title>${note.status} note #${note.id}</title>`,
	html+=e`<path d="${computeMarkerOutlinePath(heightWithAura-.5,rWithAura-.5)}" class="aura" fill="none" />`
	html+=e`<path d="${computeMarkerOutlinePath(height,r)}" fill="${note.status=='open'?'red':'green'}" />`
	const states=[...noteCommentsToStates(note.comments)]
	html+=drawStateCircles(r,nInnerCircles,states.slice(-nInnerCircles,-1))
	if (isSelected) {
		html+=drawCheckMark()
	}
	html+=e`</svg>`
	return L.divIcon({
		html,
		className: 'note-marker',
		iconSize: [widthWithAura,heightWithAura],
		iconAnchor: [(widthWithAura-1)/2,heightWithAura],
	})
	function computeMarkerOutlinePath(height: number, r: number): string {
		const rp=height-r
		const y=r**2/rp
		const x=Math.sqrt(r**2-y**2)
		const xf=x.toFixed(2)
		const yf=y.toFixed(2)
		return `M0,${rp} L-${xf},${yf} A${r},${r} 0 1 1 ${xf},${yf} Z`
	}
	function drawStateCircles(r: number, nInnerCircles: number, statesToDraw: boolean[]): string {
		const dcr=(r-.5)/nInnerCircles
		let html=``
		for (let i=2;i>=0;i--) {
			if (i>=statesToDraw.length) continue
			const cr=dcr*(i+1)
			html+=e`<circle r="${cr}" fill="${color()}" stroke="white" />`
			function color(): string {
				if (i==0 && states.length<=nInnerCircles) return 'white'
				if (statesToDraw[i]) return 'red'
				return 'green'
			}
		}
		return html
	}
	function drawCheckMark(): string {
		const path=`M-${r/4},0 L0,${r/4} L${r/2},-${r/4}`
		let html=``
		html+=e`<path d="${path}" fill="none" stroke-width="6" stroke-linecap="round" stroke="blue" />`
		html+=e`<path d="${path}" fill="none" stroke-width="2" stroke-linecap="round" stroke="white" />`
		return html
	}
}

function *noteCommentsToStates(comments: NoteComment[]): Iterable<boolean> {
	let currentState=true
	for (const comment of comments) {
		if (comment.action=='opened' || comment.action=='reopened') {
			currentState=true
		} else if (comment.action=='closed' || comment.action=='hidden') {
			currentState=false
		}
		yield currentState
	}
}
