import {strict as assert} from 'assert'
import NoteFilter from '../../test-build/filter.js'

class ApiUrlLister {
	constructor(url) {
		this.url=url
	}
}

class WebUrlLister {
	constructor(urls) {
		this.urls=urls
		this.getUrl=webPath=>`${urls[0]}${webPath}`
	}
}

const defaultListers=[
	new ApiUrlLister(`https://api.openstreetmap.org/`),
	new WebUrlLister([
		`https://www.openstreetmap.org/`,
		`https://openstreetmap.org/`,
		`https://www.osm.org/`,
		`https://osm.org/`,
	])
]

class DefaultNoteFilter extends NoteFilter {
	constructor(query) {
		super(...defaultListers,query)
	}
}

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

const assertAccept=v=>assert.equal(v,true)
const assertReject=v=>assert.equal(v,false)

describe("NoteFilter",()=>{
	const users={
		101:'Alice',
		102:'Bob',
		103:'Fred',
		104:'Joe Osmer',
	}
	const getUsername=uid=>users[uid]
	const accept=(what,filter,note)=>it("accepts "+what,()=>assertAccept(
		filter.matchNote(note,getUsername)
	))
	const reject=(what,filter,note)=>it("rejects "+what,()=>assertReject(
		filter.matchNote(note,getUsername)
	))
	it("fails on syntax error",()=>assert.throws(()=>{
		new DefaultNoteFilter('=')
	}))
	it("fails on invalid action",()=>assert.throws(()=>{
		new DefaultNoteFilter('action = fail')
	}))
	it("fails on invalid user",()=>assert.throws(()=>{
		new DefaultNoteFilter('user = ///')
	}))
	context("blank filter",()=>{
		const filter=new DefaultNoteFilter('')
		accept("anonymous note",filter,makeNoteWithUsers(0))
		accept("user note",filter,makeNoteWithUsers(101))
	})
	context("single user filter",()=>{
		const filter=new DefaultNoteFilter('user = Alice')
		reject("anonymous note",filter,makeNoteWithUsers(0))
		accept("matching user note",filter,makeNoteWithUsers(101))
		reject("non-matching user note",filter,makeNoteWithUsers(102))
		accept("matching multi-user note",filter,makeNoteWithUsers(103,101,102))
	})
	context("beginning + single user filter",()=>{
		const filter=new DefaultNoteFilter(
			'^\n'+
			'user = Fred'
		)
		accept("matching user note",filter,makeNoteWithUsers(103))
		reject("matching user note not at beginning",filter,makeNoteWithUsers(101,103))
	})
	context("anonymous user filter",()=>{
		const filter=new DefaultNoteFilter('user = 0')
		accept("anonymous note",filter,makeNoteWithUsers(0))
		reject("user note",filter,makeNoteWithUsers(103))
	})
	context("anonymous uid filter",()=>{
		const filter=new DefaultNoteFilter('user = #0')
		accept("anonymous note",filter,makeNoteWithUsers(0))
		reject("user note",filter,makeNoteWithUsers(103))
	})
	context("anonymous user filter",()=>{
		const filter=new DefaultNoteFilter('user != 0')
		reject("anonymous note",filter,makeNoteWithUsers(0))
		accept("user note",filter,makeNoteWithUsers(103))
	})
	context("single user url filter",()=>{
		const filter=new DefaultNoteFilter('user = https://www.openstreetmap.org/user/Alice')
		reject("anonymous note",filter,makeNoteWithUsers(0))
		accept("matching user note",filter,makeNoteWithUsers(101))
		reject("non-matching user note",filter,makeNoteWithUsers(102))
	})
	context("double inequality user filter",()=>{
		const filter=new DefaultNoteFilter('user != Alice, user != Bob')
		reject("note with one user equal",filter,makeNoteWithUsers(101))
		accept("note with none user equal",filter,makeNoteWithUsers(103))
	})
	context("empty comment filter",()=>{
		const filter=new DefaultNoteFilter('text = ""')
		accept("note with one empty comment",filter,makeNoteWithComments(``))
		accept("note with two empty comments",filter,makeNoteWithComments(``,``))
		accept("note with one empty and one nonempty comment",filter,makeNoteWithComments(``,`lol`))
		reject("note with one nonempty comment",filter,makeNoteWithComments(`lol`))
		reject("note with two nonempty comments",filter,makeNoteWithComments(`lol`,`kek`))
	})
	context("nonempty comment filter",()=>{
		const filter=new DefaultNoteFilter('text != ""')
		reject("note with one empty comment",filter,makeNoteWithComments(``))
		reject("note with two empty comments",filter,makeNoteWithComments(``,``))
		accept("note with one empty and one nonempty comment",filter,makeNoteWithComments(``,`lol`))
		accept("note with one nonempty comment",filter,makeNoteWithComments(`lol`))
		accept("note with two nonempty comments",filter,makeNoteWithComments(`lol`,`kek`))
	})
	context("full match comment filter",()=>{
		const filter=new DefaultNoteFilter('text = "lol"')
		reject("note with one empty comment",filter,makeNoteWithComments(``))
		accept("note with a matching comment",filter,makeNoteWithComments(`lol`))
		reject("note with a non-matching comment",filter,makeNoteWithComments(`kek`))
	})
	context("substring match comment filter",()=>{
		const filter=new DefaultNoteFilter('text ~= "street"')
		reject("note with one empty comment",filter,makeNoteWithComments(``))
		accept("note with a full matching comment",filter,makeNoteWithComments(`Street`))
		accept("note with a substring matching comment",filter,makeNoteWithComments(`Main Street`))
		reject("note with a non-matching comment",filter,makeNoteWithComments(`kek`))
	})
	context("negative substring match comment filter",()=>{
		const filter=new DefaultNoteFilter('text !~= "street"')
		accept("note with one empty comment",filter,makeNoteWithComments(``))
		reject("note with a full matching comment",filter,makeNoteWithComments(`Street`))
		reject("note with a substring matching comment",filter,makeNoteWithComments(`Main Street`))
		accept("note with a non-matching comment",filter,makeNoteWithComments(`kek`))
	})
})
