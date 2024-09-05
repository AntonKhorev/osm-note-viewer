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

const makeSingleConditionStatements=condition=>[{type:'*'},{
	type: 'conditions',
	conditions: [condition],
},{type:'*'}]

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
	context("empty comment filter",()=>{
		const statements=makeSingleConditionStatements({type: 'text', operator: '=', text: ""})
		accept("note with one empty comment",statements,makeNoteWithComments(``))
		accept("note with two empty comments",statements,makeNoteWithComments(``,``))
		accept("note with one empty and one nonempty comment",statements,makeNoteWithComments(``,`lol`))
		reject("note with one nonempty comment",statements,makeNoteWithComments(`lol`))
		reject("note with two nonempty comments",statements,makeNoteWithComments(`lol`,`kek`))
	})
	context("nonempty comment filter",()=>{
		const statements=makeSingleConditionStatements({type: 'text', operator: '!=', text: ""})
		reject("note with one empty comment",statements,makeNoteWithComments(``))
		reject("note with two empty comments",statements,makeNoteWithComments(``,``))
		accept("note with one empty and one nonempty comment",statements,makeNoteWithComments(``,`lol`))
		accept("note with one nonempty comment",statements,makeNoteWithComments(`lol`))
		accept("note with two nonempty comments",statements,makeNoteWithComments(`lol`,`kek`))
	})
	context("full match comment filter",()=>{
		const statements=makeSingleConditionStatements({type: 'text', operator: '=', text: "lol"})
		reject("note with one empty comment",statements,makeNoteWithComments(``))
		accept("note with a matching comment",statements,makeNoteWithComments(`lol`))
		reject("note with a non-matching comment",statements,makeNoteWithComments(`kek`))
	})
	context("substring match comment filter",()=>{
		const statements=makeSingleConditionStatements({type: 'text', operator: '~=', text: "street"})
		reject("note with one empty comment",statements,makeNoteWithComments(``))
		accept("note with a full matching comment",statements,makeNoteWithComments(`Street`))
		accept("note with a substring matching comment",statements,makeNoteWithComments(`Main Street`))
		reject("note with a non-matching comment",statements,makeNoteWithComments(`wut`))
	})
	context("negative substring match comment filter",()=>{
		const statements=makeSingleConditionStatements({type: 'text', operator: '!~=', text: "street"})
		accept("note with one empty comment",statements,makeNoteWithComments(``))
		reject("note with a full matching comment",statements,makeNoteWithComments(`Street`))
		reject("note with a substring matching comment",statements,makeNoteWithComments(`Main Street`))
		accept("note with a non-matching comment",statements,makeNoteWithComments(`nope`))
	})
})
