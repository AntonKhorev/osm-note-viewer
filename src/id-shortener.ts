export default class IdShortener {
	private template: string|undefined
	private bound: number|undefined
	private diverse=false
	/**
	 * @returns if can break
	 */
	scan(id: string): boolean {
		if (this.template==null || this.bound==null) {
			this.template=id
			this.bound=id.length
			return false
		}
		this.diverse||=this.template!=id
		if (this.template.length!=id.length) {
			this.bound=0
			return true
		}
		for (let i=0;i<this.bound;i++) {
			if (this.template[i]!=id[i]) {
				this.bound=i
				break
			}
		}
		return this.bound==0
	}
	split(id: string): [constantPart: string, variablePart: string] {
		if (!this.diverse || this.bound==null) return ['',id]
		return [id.slice(0,this.bound),id.slice(this.bound)]
	}
}
