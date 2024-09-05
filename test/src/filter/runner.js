import {strict as assert} from 'assert'
import {matchNote} from '../../../test-build/filter/runner.js'

const makeNoteWithComments=(...texts)=>{
	const comments=[]
	let date=1645433069
	let action='opened'
	for (const text of texts) {
		const comment={date,action,text}
		comments.push(comment)
		date+=60*60*24
		action='commented'
	}
	return {
		id: 42,
		lat: 60,
		lon: 30,
		status: 'open',
		comments
	}
}

const assertAccept=v=>assert.equal(v,true)
const assertReject=v=>assert.equal(v,false)

describe("filter / matchNote()",()=>{
	const users={
		101:'Alice',
		102:'Bob',
		103:'Fred',
		104:'Joe Osmer',
	}
	const getUsername=uid=>users[uid]
	const accept=(what,statements,note)=>it("accepts "+what,()=>assertAccept(
		matchNote(statements,note,getUsername)
	))
	const reject=(what,statements,note)=>it("rejects "+what,()=>assertReject(
		matchNote(statements,note,getUsername)
	))
	context("negative substring match comment filter",()=>{
		const statements=[
			{
				type: 'conditions',
				conditions: [
					{
						operator: '!~=',
						type: 'text',
						text: "street",
					}
				]
			}
		]
		accept("note with one empty comment",statements,makeNoteWithComments(``))
		reject("note with a full matching comment",statements,makeNoteWithComments(`Street`))
		reject("note with a substring matching comment",statements,makeNoteWithComments(`Main Street`))
		accept("note with a non-matching comment",statements,makeNoteWithComments(`nope`))
	})
})
