import {makeElement, makeLink} from './html'

type Content = Array<string|HTMLElement>

export default class RadioTable {
	readonly $table=makeElement('table')()()
	private readonly cellClassesList: string[][] = []
	private nRows=0
	constructor(
		private readonly radioName: string,
		columns: [cellClasses:string[], cellLabels:Content][]
	) {
		const $row=this.$table.insertRow()
		for (const [cellClasses,cellLabels] of [[[],[]],...columns]) {
			$row.append(
				makeElement('th')(...cellClasses)(...cellLabels)
			)
			this.cellClassesList.push(cellClasses)
		}
	}
	addRow(
		provideCellContent: ($radio:HTMLInputElement)=>(undefined|boolean|string|Content)[]
	): void {
		const $radio=document.createElement('input')
		$radio.type='radio'
		$radio.name=this.radioName
		$radio.id=`${this.radioName}-${this.nRows}`
		const $row=this.$table.insertRow()
		const contentList=[[$radio],...provideCellContent($radio)]
		for (const [i,cellContent] of contentList.entries()) {
			const cellClasses=this.cellClassesList[i]??[]
			let rawCellContent: Content
			if (typeof cellContent == 'undefined') {
				rawCellContent=[]
			} else if (typeof cellContent == 'boolean') {
				rawCellContent=[cellContent ? '+' : '']
			} else if (typeof cellContent == 'string') {
				rawCellContent=[cellContent ? makeLink('+',cellContent) : '']
			} else {
				rawCellContent=cellContent
			}
			$row.append(makeElement('td')(...cellClasses)(...rawCellContent))
		}
		this.nRows++
	}
}
