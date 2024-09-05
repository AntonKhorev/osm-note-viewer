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

const conditionStartRegexp=/^(?<type>[a-z]+)\s*(?<op>!?~?=?=)\s*(?<rest>.*)$/
const simpleValueRegexp=/^(?<value>[^,]+)(?<rest>.*)$/
const textValueRegexp=/^(?:"(?<doubleQuotedText>[^"]*)"|'(?<singleQuotedText>[^']*)')(?<rest>.*)$/
const conditionSeparatorRegexp=/^\s*,\s*(?<rest>.*)$/

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
		let rest=line
		while (rest.length>0) {
			const conditionStartGroups=matchGroups(conditionStartRegexp)
			const type=conditionStartGroups.type
			const operator=getOperator(conditionStartGroups.op)
			if (type=='user') {
				const {value}=matchGroups(simpleValueRegexp)
				const user=getUserQuery(value)
				if (user.type=='invalid' || user.type=='empty') {
					throwError(`Invalid user value "${value}"`)
				}
				conditions.push({type,operator,user})
			} else if (type=='action') {
				const {value:action}=matchGroups(simpleValueRegexp)
				if (action!='opened' && action!='closed' && action!='reopened' && action!='commented' && action!='hidden') {
					throwError(`Invalid action value "${action}"`)
				}
				conditions.push({type,operator,action})
			} else if (type=='text') {
				const groups=matchGroups(textValueRegexp)
				const text=groups.doubleQuotedText??groups.singleQuotedText
				conditions.push({type,operator,text})
			} else {
				throwError(`Unknown condition type "${type}"`)
			}
			if (rest.length>0) matchGroups(conditionSeparatorRegexp)
		}
		if (conditions.length>0) statements.push({type:'conditions',conditions})
		function getOperator(op: string): Operator {
			if (op=='=' || op=='!=' || op=='~=' || op=='!~=') return op
			if (op=='==') return '='
			throwError(`Invalid operator "${op}"`)
		}
		function matchGroups(regExp: RegExp): {[key: string]: string} {
			const match=rest.match(regExp)
			if (!match || !match.groups) throwError(`Syntax error`)
			rest=match.groups.rest
			return match.groups
		}
		function throwError(message: string): never {
			throw new RangeError(`${message} on line ${lineNumber}: ${line}`)
		}
	}
	return statements
}
