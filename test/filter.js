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
	const anonNote={
		id: 42,
		lat: 60,
		lon: 30,
		status: 'open',
		comments: [
			{date:1645433069,action:'opened',text:'hello world'}
		]
	}
	const aliceNote={
		id: 42,
		lat: 60,
		lon: 30,
		status: 'open',
		comments: [
			{date:1645433069,action:'opened',text:'hello world',uid:101}
		]
	}
	const bobNote={
		id: 42,
		lat: 60,
		lon: 30,
		status: 'open',
		comments: [
			{date:1645433069,action:'opened',text:'hello world',uid:102}
		]
	}
	context("blank filter",()=>{
		const filter=new NoteFilter('')
		it("accepts anonymous note",()=>{
			assert.equal(
				filter.matchNote(anonNote,uidMatcher),
				true
			)
		})
		it("accepts user note",()=>{
			assert.equal(
				filter.matchNote(aliceNote,uidMatcher),
				true
			)
		})
	})
	context("single user filter",()=>{
		const filter=new NoteFilter('user = Alice')
		it("rejects anonymous note",()=>{
			assert.equal(
				filter.matchNote(anonNote,uidMatcher),
				false
			)
		})
		it("accepts matching user note",()=>{
			assert.equal(
				filter.matchNote(aliceNote,uidMatcher),
				true
			)
		})
		it("rejects non-matching user note",()=>{
			assert.equal(
				filter.matchNote(bobNote,uidMatcher),
				false
			)
		})
	})
})
