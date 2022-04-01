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
	context("blank filter",()=>{
		const filter=new NoteFilter('')
		it("accepts anonymous note",()=>assertAccept(
			filter.matchNote(makeNoteWithUsers(0),uidMatcher),
		))
		it("accepts user note",()=>assertAccept(
			filter.matchNote(makeNoteWithUsers(101),uidMatcher),
		))
	})
	context("single user filter",()=>{
		const filter=new NoteFilter('user = Alice')
		it("rejects anonymous note",()=>assertReject(
			filter.matchNote(makeNoteWithUsers(0),uidMatcher),
		))
		it("accepts matching user note",()=>assertAccept(
			filter.matchNote(makeNoteWithUsers(101),uidMatcher),
		))
		it("rejects non-matching user note",()=>assertReject(
			filter.matchNote(makeNoteWithUsers(102),uidMatcher),
		))
		it("accepts matching multi-user note",()=>assertAccept(
			filter.matchNote(makeNoteWithUsers(103,101,102),uidMatcher),
		))
	})
	context("beginning + single user filter",()=>{
		const filter=new NoteFilter(
			'^\n'+
			'user = Fred'
		)
		it("accepts matching user note",()=>assertAccept(
			filter.matchNote(makeNoteWithUsers(103),uidMatcher),
		))
		it("rejects matching user note not at beginning",()=>assertReject(
			filter.matchNote(makeNoteWithUsers(101,103),uidMatcher),
		))
	})
	context("anonymous user filter",()=>{
		const filter=new NoteFilter('user = 0')
		it("accepts anonymous note",()=>assertAccept(
			filter.matchNote(makeNoteWithUsers(0),uidMatcher),
		))
		it("rejects user note",()=>assertReject(
			filter.matchNote(makeNoteWithUsers(103),uidMatcher),
		))
	})
	context("anonymous uid filter",()=>{
		const filter=new NoteFilter('user = #0')
		it("accepts anonymous note",()=>assertAccept(
			filter.matchNote(makeNoteWithUsers(0),uidMatcher),
		))
		it("rejects user note",()=>assertReject(
			filter.matchNote(makeNoteWithUsers(103),uidMatcher),
		))
	})
	context("anonymous user filter",()=>{
		const filter=new NoteFilter('user != 0')
		it("rejects anonymous note",()=>assertReject(
			filter.matchNote(makeNoteWithUsers(0),uidMatcher),
		))
		it("accepts user note",()=>assertAccept(
			filter.matchNote(makeNoteWithUsers(103),uidMatcher),
		))
	})
	context("single user url filter",()=>{
		const filter=new NoteFilter('user = https://www.openstreetmap.org/user/Alice')
		it("rejects anonymous note",()=>assertReject(
			filter.matchNote(makeNoteWithUsers(0),uidMatcher),
		))
		it("accepts matching user note",()=>assertAccept(
			filter.matchNote(makeNoteWithUsers(101),uidMatcher),
		))
		it("rejects non-matching user note",()=>assertReject(
			filter.matchNote(makeNoteWithUsers(102),uidMatcher),
		))
	})
	context("double inequality user filter",()=>{
		const filter=new NoteFilter('user != Alice, user != Bob')
		it("rejects note with one user equal",()=>assertReject(
			filter.matchNote(makeNoteWithUsers(101),uidMatcher),
		))
		it("accepts note with none user equal",()=>assertAccept(
			filter.matchNote(makeNoteWithUsers(103),uidMatcher),
		))
	})
	// context("empty comment filter",()=>{
	// 	const filter=new NoteFilter('text = ""')
	// 	it("accepts note with one empty comment",()=>assertAccept(
	// 		filter.matchNote(makeNoteWithComments(``))
	// 	))
	// })
})
