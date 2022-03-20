import {Note, NoteComment} from './data'

interface BeginningStatement {
	type: '^'
}

interface EndStatement {
	type: '$'
}

interface AnyStatement {
	type: '*'
}

interface UserStatement {
	type: 'user',
	user: string
}

type Statement = BeginningStatement | EndStatement | AnyStatement | UserStatement

export default class NoteFilter {
	private statements: Statement[] = []
	constructor(query: string) {
		for (const untrimmedLine of query.split('\n')) {
			const line=untrimmedLine.trim()
			for (const c of ['^','$','*'] as const) {
				if (line==c) {
					this.statements.push({type:c})
					continue
				}
			}
			let match
			if (match=line.match(/^user\s*=\s*(.+)$/)) {
				const [,user]=match
				this.statements.push({type:'user',user})
				continue
			}
			// TODO parse error?
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
	matchNote(note: Note, uidMatcher: (uid: number, matchUser: string) => boolean): boolean {
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
			if (statement.type=='user') {
				if (comment.uid==null) return false
				if (!uidMatcher(comment.uid,statement.user)) return false
				return rec(iStatement+1,iComment+1)
			}
			return false // shouldn't happen
		}
		return rec(0,0)
		// return rec1(0,0)
	}
}
