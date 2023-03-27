import type {Note, NoteComment} from './data'
import type {ApiUrlLister, WebUrlLister} from './net/server'
import type {ValidUserQuery} from './query-user'
import {toUserQuery} from './query-user'
import {escapeRegex} from './util/escape'

type Operator = '=' | '!=' | '~='

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
	operator: Operator
}

type UserCondition = BaseCondition & ValidUserQuery & {
	type: 'user'
}

interface ActionCondition extends BaseCondition {
	type: 'action'
	action: 'opened' | 'closed' | 'reopened' | 'commented' | 'hidden'
}

interface TextCondition extends BaseCondition {
	type: 'text'
	text: string
}

type Condition = UserCondition | ActionCondition | TextCondition

interface ConditionsStatement {
	type: 'conditions',
	conditions: Condition[]
}

type Statement = BeginningStatement | EndStatement | AnyStatement | ConditionsStatement

function isValidOperator(op: string): op is Operator {
	return (op=='=' || op=='!=' || op=='~=')
}

export default class NoteFilter {
	private statements: Statement[] = []
	constructor(apiUrlLister: ApiUrlLister, webUrlLister: WebUrlLister, private query: string) {
		let lineNumber=0
		lineLoop: for (const untrimmedLine of query.split('\n')) {
			lineNumber++
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
				const makeRegExp=(symbol: string, rest: string): RegExp => new RegExp(`^${symbol}\\s*([!~]?=)\\s*${rest}$`)
				const matchTerm=(symbol: string, rest: string): RegExpMatchArray | null => term.match(makeRegExp(symbol,rest))
				let match
				if (match=matchTerm('user','(.+)')) {
					const [,operator,user]=match
					if (!isValidOperator(operator)) continue // impossible
					const userQuery=toUserQuery(apiUrlLister,webUrlLister,user)
					if (userQuery.userType=='invalid' || userQuery.userType=='empty') {
						throwError(`Invalid user value "${user}"`)
					}
					conditions.push({type:'user',operator,...userQuery})
					continue
				} else if (match=matchTerm('action','(.+)')) {
					const [,operator,action]=match
					if (!isValidOperator(operator)) continue // impossible
					if (action!='opened' && action!='closed' && action!='reopened' && action!='commented' && action!='hidden') {
						throwError(`Invalid action value "${action}"`)
					}
					conditions.push({type:'action',operator,action})
					continue
				} else if (match=matchTerm('text','"([^"]*)"')) {
					const [,operator,text]=match
					if (!isValidOperator(operator)) continue // impossible
					conditions.push({type:'text',operator,text})
					continue
				}
				throwError(`Syntax error`)
				function throwError(message: string): never {
					throw new RangeError(`${message} on line ${lineNumber}: ${line}`)
				}
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
	matchNote(note: Note, getUsername: (uid: number) => string|undefined): boolean {
		// console.log('> match',this.statements,note.comments)
		const isCommentEqualToUserConditionValue=(condition: UserCondition, comment: NoteComment): boolean => {
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
					if (getUsername(comment.uid)!=condition.username) return false
				}
			}
			return true
		}
		const getConditionActualValue=(condition: Condition, comment: NoteComment): string | number | undefined => {
			if (condition.type=='user') {
				if (condition.userType=='id') {
					return comment.uid
				} else {
					if (comment.uid==null) return undefined
					return getUsername(comment.uid)
				}
			} else if (condition.type=='action') {
				return comment.action
			} else if (condition.type=='text') {
				return comment.text
			}
		}
		const getConditionCompareValue=(condition: Condition): string | number | undefined => {
			if (condition.type=='user') {
				if (condition.userType=='id') {
					return condition.uid
				} else {
					return condition.username
				}
			} else if (condition.type=='action') {
				return condition.action
			} else if (condition.type=='text') {
				return condition.text
			}
		}
		const isOperatorMatches=(operator: Operator, actualValue: string|number|undefined, compareValue: string|number|undefined): boolean => {
			const str=(v: string|number|undefined): string => String(v??'')
			if (operator=='=') return actualValue==compareValue
			if (operator=='!=') return actualValue!=compareValue
			if (operator=='~=') return !!str(actualValue).match(new RegExp(escapeRegex(str(compareValue)),'i'))
			return false // shouldn't happen
		}
		const isConditionMatches=(condition: Condition, comment: NoteComment): boolean => {
			if (condition.type=='user' && (condition.operator=='=' || condition.operator=='!=')) {
				const isEqual=isCommentEqualToUserConditionValue(condition,comment)
				return condition.operator=='=' ? isEqual : !isEqual
			}
			return isOperatorMatches(
				condition.operator,
				getConditionActualValue(condition,comment),
				getConditionCompareValue(condition)
			)
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
					if (!isConditionMatches(condition,comment)) return false
				}
				return rec(iStatement+1,iComment+1)
			}
			return false // shouldn't happen
		}
		return rec(0,0)
		// return rec1(0,0)
	}
}
