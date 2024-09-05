import type {Note, NoteComment} from '../data'
import {escapeRegex} from '../util/escape'
import type {Statement, Condition, UserCondition, Operator} from './parser'

export function matchNote(originalStatements: Statement[], note: Note, getUsername: (uid: number) => string|undefined): boolean {
	// console.log('> match',originalStatements,note.comments)
	const isCommentEqualToUserConditionValue=(condition: UserCondition, comment: NoteComment): boolean => {
		if (condition.user.type=='id') {
			if (condition.user.uid==0) {
				if (comment.uid!=null) return false
			} else {
				if (comment.uid!=condition.user.uid) return false
			}
		} else {
			if (condition.user.username=='0') {
				if (comment.uid!=null) return false
			} else {
				if (comment.uid==null) return false
				if (getUsername(comment.uid)!=condition.user.username) return false
			}
		}
		return true
	}
	const getConditionActualValue=(condition: Condition, comment: NoteComment): string | number | undefined => {
		if (condition.type=='user') {
			if (condition.user.type=='id') {
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
			if (condition.user.type=='id') {
				return condition.user.uid
			} else {
				return condition.user.username
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
		if (operator=='!~=') return !str(actualValue).match(new RegExp(escapeRegex(str(compareValue)),'i'))
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

	const statements=[...originalStatements]
	if (statements.length>0) {
		const st1=statements[0].type
		if (st1!='^' && st1!='*') {
			statements.unshift({type:'*'})
		}
		const st2=statements[statements.length-1].type
		if (st2!='$' && st2!='*') {
			statements.push({type:'*'})
		}
	}
	// const rec=(iStatement: number, iComment: number): boolean => {
	// 	console.log('>> rec',iStatement,iComment)
	// 	const result=rec1(iStatement,iComment)
	// 	console.log('<< rec',iStatement,iComment,'got',result)
	// 	return result
	// }
	const rec=(iStatement: number, iComment: number): boolean => {
	// const rec1=(iStatement: number, iComment: number): boolean => {
		if (iStatement>=statements.length) return true
		const statement=statements[iStatement]
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
