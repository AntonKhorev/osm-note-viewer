import {Note, NoteComment} from './data'
import {ValidUserQueryPart, toUserQueryPart} from './query'

interface BeginningStatement {
	type: '^'
}

interface EndStatement {
	type: '$'
}

interface AnyStatement {
	type: '*'
}

interface BaseCondition {
	operator: '=' | '!='
}

type UserCondition = BaseCondition & ValidUserQueryPart & {
	type: 'user'
}

interface ActionCondition extends BaseCondition {
	type: 'action'
	action: 'opened' | 'closed' | 'reopened' | 'commented' | 'hidden'
}

type Condition = UserCondition | ActionCondition

interface ConditionsStatement {
	type: 'conditions',
	conditions: Condition[]
}

type Statement = BeginningStatement | EndStatement | AnyStatement | ConditionsStatement

export default class NoteFilter {
	private statements: Statement[] = []
	constructor(private query: string) {
		lineLoop: for (const untrimmedLine of query.split('\n')) {
			const line=untrimmedLine.trim()
			if (!line) continue
			for (const c of ['^','$','*'] as const) {
				if (line==c) {
					this.statements.push({type:c})
					continue lineLoop
				}
			}
			const conditions: Condition[] = []
			for (const untrimmedTerm of line.split(',')) {
				const term=untrimmedTerm.trim()
				let match
				if (match=term.match(/^user\s*(!?=)\s*(.+)$/)) {
					const [,operator,user]=match
					if (operator!='=' && operator!='!=') continue // impossible
					const userQueryPart=toUserQueryPart(user)
					if (userQueryPart.userType=='invalid') continue // TODO parse error?
					conditions.push({type:'user',operator,...userQueryPart})
					continue
				} else if (match=term.match(/^action\s*(!?=)\s*(.+)$/)) {
					const [,operator,action]=match
					if (operator!='=' && operator!='!=') continue // impossible
					if (action!='opened' && action!='closed' && action!='reopened' && action!='commented' && action!='hidden') continue
					conditions.push({type:'action',operator,action})
					continue
				}
				// TODO parse error?
			}
			if (conditions.length>0) this.statements.push({type:'conditions',conditions})
		}
		if (this.statements.length>0) {
			const st1=this.statements[0].type
			if (st1!='^' && st1!='*') {
				this.statements.unshift({type:'*'})
			}
			const st2=this.statements[this.statements.length-1].type
			if (st2!='$' && st2!='*') {
				this.statements.push({type:'*'})
			}
		}
	}
	isSameQuery(query: string): boolean {
		return this.query==query
	}
	matchNote(note: Note, uidMatcher: (uid: number, matchUser: string) => boolean): boolean {
		// console.log('> match',this.statements,note.comments)
		const isCommentValueEqualToConditionValue=(condition: Condition, comment: NoteComment): boolean => {
			if (condition.type=='user') {
				if (condition.userType=='id') {
					if (condition.uid==0) {
						if (comment.uid!=null) return false
					} else {
						if (comment.uid!=condition.uid) return false
					}
				} else {
					if (condition.username=='0') {
						if (comment.uid!=null) return false
					} else {
						if (comment.uid==null) return false
						if (!uidMatcher(comment.uid,condition.username)) return false
					}
				}
				return true
			} else if (condition.type=='action') {
				return comment.action==condition.action
			}
			return false // shouldn't happen
		}
		// const rec=(iStatement: number, iComment: number): boolean => {
		// 	console.log('>> rec',iStatement,iComment)
		// 	const result=rec1(iStatement,iComment)
		// 	console.log('<< rec',iStatement,iComment,'got',result)
		// 	return result
		// }
		const rec=(iStatement: number, iComment: number): boolean => {
		// const rec1=(iStatement: number, iComment: number): boolean => {
			if (iStatement>=this.statements.length) return true
			const statement=this.statements[iStatement]
			if (statement.type=='^') {
				if (iComment!=0) return false
				return rec(iStatement+1,iComment)
			} else if (statement.type=='$') {
				return iComment==note.comments.length
			} else if (statement.type=='*') {
				if (iComment<note.comments.length && rec(iStatement,iComment+1)) return true
				return rec(iStatement+1,iComment)
			}
			if (iComment>=note.comments.length) return false
			const comment=note.comments[iComment]
			if (statement.type=='conditions') {
				for (const condition of statement.conditions) {
					let ok=isCommentValueEqualToConditionValue(condition,comment)
					if (condition.operator=='=') {
						// ok
					} else if (condition.operator=='!=') {
						ok=!ok
					}
					if (!ok) return false
				}
				return rec(iStatement+1,iComment+1)
			}
			return false // shouldn't happen
		}
		return rec(0,0)
		// return rec1(0,0)
	}
}
