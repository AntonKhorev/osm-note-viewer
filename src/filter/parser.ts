import type {UserQuery, ValidUserQuery} from '../query'

export type Operator = '=' | '!=' | '~=' | '!~='

type BeginningStatement = {
	type: '^'
}

type EndStatement = {
	type: '$'
}

type AnyStatement = {
	type: '*'
}

type BaseCondition = {
	operator: Operator
}

export type UserCondition = BaseCondition & {
	type: 'user'
	user: ValidUserQuery
}

type ActionCondition = BaseCondition & {
	type: 'action'
	action: 'opened' | 'closed' | 'reopened' | 'commented' | 'hidden'
}

type TextCondition = BaseCondition & {
	type: 'text'
	text: string
}

export type Condition = UserCondition | ActionCondition | TextCondition

type ConditionsStatement = {
	type: 'conditions',
	conditions: Condition[]
}

export type Statement = BeginningStatement | EndStatement | AnyStatement | ConditionsStatement

function isValidOperator(op: string): op is Operator {
	return (op=='=' || op=='!=' || op=='~=' || op=='!~=')
}

export function parseFilterString(query: string, getUserQuery: (user: string) => UserQuery): Statement[] {
	const statements: Statement[] = []
	let lineNumber=0
	lineLoop: for (const untrimmedLine of query.split('\n')) {
		lineNumber++
		const line=untrimmedLine.trim()
		if (!line) continue
		for (const c of ['^','$','*'] as const) {
			if (line==c) {
				statements.push({type:c})
				continue lineLoop
			}
		}
		const conditions: Condition[] = []
		for (const untrimmedTerm of line.split(',')) {
			const term=untrimmedTerm.trim()
			const makeRegExp=(symbol: string, rest: string): RegExp => new RegExp(`^${symbol}\\s*(!?~?=)\\s*${rest}$`)
			const matchTerm=(symbol: string, rest: string): RegExpMatchArray | null => term.match(makeRegExp(symbol,rest))
			let match
			if (match=matchTerm('user','(.+)')) {
				const [,operator,user]=match
				if (!isValidOperator(operator)) continue // impossible
				const userQuery=getUserQuery(user)
				if (userQuery.type=='invalid' || userQuery.type=='empty') {
					throwError(`Invalid user value "${user}"`)
				}
				conditions.push({type:'user',operator,user:userQuery})
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
		if (conditions.length>0) statements.push({type:'conditions',conditions})
	}
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
	return statements
}
