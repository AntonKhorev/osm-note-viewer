import {strict as assert} from 'assert'
import {matchNote} from '../../../test-build/filter/runner.js'

const makeNoteWithUsers=(...uids)=>{
	const comments=[]
	let date=1645433069
	let action='opened'
	for (const uid of uids) {
		const comment={date,action,text:'hello world'}
		if (uid) comment.uid=uid
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

const makeSingleConditionStatements=condition=>[{
	type: 'conditions',
	conditions: [condition],
}]

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
	context("blank filter",()=>{
		accept("anonymous note",[],makeNoteWithUsers(0))
		accept("user note",[],makeNoteWithUsers(101))
	})
	context("single user filter",()=>{
		const statements=makeSingleConditionStatements({type: 'user', operator: '=', user: {type: 'name', username: 'Alice'}})
		reject("anonymous note",statements,makeNoteWithUsers(0))
		accept("matching user note",statements,makeNoteWithUsers(101))
		reject("non-matching user note",statements,makeNoteWithUsers(102))
		accept("matching multi-user note",statements,makeNoteWithUsers(103,101,102))
	})
	context("beginning + single user filter",()=>{
		const statements=[
			{type: '^'},
			{type: 'conditions', conditions: [
				{type: 'user', operator: '=', user: {type: 'name', username: 'Fred'}}
			]},
		]
		accept("matching user note",statements,makeNoteWithUsers(103))
		reject("matching user note not at beginning",statements,makeNoteWithUsers(101,103))
	})
	context("anonymous user filter",()=>{
		const statements=makeSingleConditionStatements({type: 'user', operator: '=', user: {type: 'name', username: '0'}})
		accept("anonymous note",statements,makeNoteWithUsers(0))
		reject("user note",statements,makeNoteWithUsers(103))
	})
	context("anonymous uid filter",()=>{
		const statements=makeSingleConditionStatements({type: 'user', operator: '=', user: {type: 'id', uid: 0}})
		accept("anonymous note",statements,makeNoteWithUsers(0))
		reject("user note",statements,makeNoteWithUsers(103))
	})
	context("non-anonymous user filter",()=>{
		const statements=makeSingleConditionStatements({type: 'user', operator: '!=', user: {type: 'name', username: '0'}})
		reject("anonymous note",statements,makeNoteWithUsers(0))
		accept("user note",statements,makeNoteWithUsers(103))
	})
	context("double inequality user filter",()=>{
		const statements=[
			{type: 'conditions', conditions: [
				{type: 'user', operator: '!=', user: {type: 'name', username: 'Alice'}},
				{type: 'user', operator: '!=', user: {type: 'name', username: 'Bob'}},
			]},
		]
		reject("note with one user equal",statements,makeNoteWithUsers(101))
		accept("note with none user equal",statements,makeNoteWithUsers(103))
	})
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
