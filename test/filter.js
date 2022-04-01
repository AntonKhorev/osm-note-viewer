import {strict as assert} from 'assert'
import NoteFilter from '../test-build/filter.js'

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

const makeNoteWithComments=(...comments)=>{
	let date=1645433069
	let action='opened'
	for (const text of comments) {
		const comment={date,action,text}
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

const assertAccept=v=>assert.equal(v,true)
const assertReject=v=>assert.equal(v,false)

describe("NoteFilter",()=>{
	const users={
		101:'Alice',
		102:'Bob',
		103:'Fred',
		104:'Joe Osmer',
	}
	const uidMatcher=(uid,matchUser)=>users[uid]==matchUser
	const accept=(what,filter,note)=>it("accepts "+what,()=>assertAccept(
		filter.matchNote(note,uidMatcher)
	))
	const reject=(what,filter,note)=>it("rejects "+what,()=>assertReject(
		filter.matchNote(note,uidMatcher)
	))
	context("blank filter",()=>{
		const filter=new NoteFilter('')
		accept("anonymous note",filter,makeNoteWithUsers(0))
		accept("user note",filter,makeNoteWithUsers(101))
	})
	context("single user filter",()=>{
		const filter=new NoteFilter('user = Alice')
		reject("anonymous note",filter,makeNoteWithUsers(0))
		accept("matching user note",filter,makeNoteWithUsers(101))
		reject("non-matching user note",filter,makeNoteWithUsers(102))
		accept("matching multi-user note",filter,makeNoteWithUsers(103,101,102))
	})
	context("beginning + single user filter",()=>{
		const filter=new NoteFilter(
			'^\n'+
			'user = Fred'
		)
		accept("matching user note",filter,makeNoteWithUsers(103))
		reject("matching user note not at beginning",filter,makeNoteWithUsers(101,103))
	})
	context("anonymous user filter",()=>{
		const filter=new NoteFilter('user = 0')
		accept("anonymous note",filter,makeNoteWithUsers(0))
		reject("user note",filter,makeNoteWithUsers(103))
	})
	context("anonymous uid filter",()=>{
		const filter=new NoteFilter('user = #0')
		accept("anonymous note",filter,makeNoteWithUsers(0))
		reject("user note",filter,makeNoteWithUsers(103))
	})
	context("anonymous user filter",()=>{
		const filter=new NoteFilter('user != 0')
		reject("anonymous note",filter,makeNoteWithUsers(0))
		accept("user note",filter,makeNoteWithUsers(103))
	})
	context("single user url filter",()=>{
		const filter=new NoteFilter('user = https://www.openstreetmap.org/user/Alice')
		reject("anonymous note",filter,makeNoteWithUsers(0))
		accept("matching user note",filter,makeNoteWithUsers(101))
		reject("non-matching user note",filter,makeNoteWithUsers(102))
	})
	context("double inequality user filter",()=>{
		const filter=new NoteFilter('user != Alice, user != Bob')
		reject("note with one user equal",filter,makeNoteWithUsers(101))
		accept("note with none user equal",filter,makeNoteWithUsers(103))
	})
	// context("empty comment filter",()=>{
	// 	const filter=new NoteFilter('text = ""')
	// 	accept("note with one empty comment",filter,makeNoteWithComments(``))
	// })
})
