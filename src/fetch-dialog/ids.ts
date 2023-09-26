import {NoteFetchDialog, mixinWithAutoLoadCheckbox} from './base'

export abstract class NoteIdsFetchDialog extends mixinWithAutoLoadCheckbox(NoteFetchDialog) {
	protected limitValues=[5,20]
	protected limitDefaultValue=5
	protected limitLeadText=`Download these `
	protected limitLabelBeforeText=`in batches of `
	protected limitLabelAfterText=` notes`
	protected limitIsParameter=false
}
