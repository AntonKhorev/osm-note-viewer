export default class NoteMapBounds {
	w:string
	s:string
	e:string
	n:string
	constructor(bounds:L.LatLngBounds,precision:number) {
		this.w=bounds.getWest() .toFixed(precision)
		this.s=bounds.getSouth().toFixed(precision)
		this.e=bounds.getEast() .toFixed(precision)
		this.n=bounds.getNorth().toFixed(precision)
	}
	get wsen(): [w:string,s:string,e:string,n:string] {
		return [this.w,this.s,this.e,this.n]
	}
	get swne(): [s:string,w:string,n:string,e:string] {
		return [this.s,this.w,this.n,this.e]
	}
}
