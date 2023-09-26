import NoteFetchDialog from './base'

export default abstract class StaticNoteFetchDialog extends NoteFetchDialog {
	protected withAutoload=true
	protected limitValues=[5,20]
	protected limitDefaultValue=5
	protected limitLeadText=`Download these `
	protected limitLabelBeforeText=`in batches of `
	protected limitLabelAfterText=` notes`
	protected limitIsParameter=false
}
