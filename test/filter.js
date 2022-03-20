import {strict as assert} from 'assert'
import NoteFilter from '../test-build/filter.js'

describe("NoteFilter",()=>{
	const users={
		101:'Alice',
		102:'Bob',
		103:'Fred',
		104:'Joe Osmer',
	}
	const uidMatcher=(uid,matchUser)=>users[uid]==matchUser
	const makeNote=(...uids)=>{
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
	context("blank filter",()=>{
		const filter=new NoteFilter('')
		it("accepts anonymous note",()=>{
			assert.equal(
				filter.matchNote(makeNote(0),uidMatcher),
				true
			)
		})
		it("accepts user note",()=>{
			assert.equal(
				filter.matchNote(makeNote(101),uidMatcher),
				true
			)
		})
	})
	context("single user filter",()=>{
		const filter=new NoteFilter('user = Alice')
		it("rejects anonymous note",()=>{
			assert.equal(
				filter.matchNote(makeNote(0),uidMatcher),
				false
			)
		})
		it("accepts matching user note",()=>{
			assert.equal(
				filter.matchNote(makeNote(101),uidMatcher),
				true
			)
		})
		it("rejects non-matching user note",()=>{
			assert.equal(
				filter.matchNote(makeNote(102),uidMatcher),
				false
			)
		})
		it("accepts matching multi-user note",()=>{
			assert.equal(
				filter.matchNote(makeNote(103,101,102),uidMatcher),
				true
			)
		})
	})
	context("beginning + single user filter",()=>{
		const filter=new NoteFilter(
			'^\n'+
			'user = Fred'
		)
		it("accepts matching user note",()=>{
			assert.equal(
				filter.matchNote(makeNote(103),uidMatcher),
				true
			)
		})
		it("rejects matching user note not at beginning",()=>{
			assert.equal(
				filter.matchNote(makeNote(101,103),uidMatcher),
				false
			)
		})
	})
})
