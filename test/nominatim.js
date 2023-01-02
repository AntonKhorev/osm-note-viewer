import {strict as assert} from 'assert'
import {NominatimBboxFetcher} from '../test-build/nominatim.js'

function bboxResponse(boundingbox) {
	return [
		{
			boundingbox
		}
	]
}

function makeFetcherInterface(calls,fetchResult,cacheResult) {
	return [
		// private nominatimProvider: NominatimProvider,
		{
			async search(parameters) {
				calls.push(['fetchFromServer',parameters])
				return fetchResult
			},
			getSearchUrl(parameters) {
				return `https://nominatim.example.com/search?`+parameters
			}
		},
		// private fetchFromCache: (timestamp:number,parameters:string)=>Promise<any>,
		async(timestamp,parameters)=>{
			calls.push(['fetchFromCache',timestamp,parameters])
			return cacheResult
		},
		// private storeToCache: (timestamp:number,parameters:string,bbox:NominatimBbox)=>Promise<any>
		async(timestamp,parameters,bbox)=>{
			calls.push(['storeToCache',timestamp,parameters,bbox])
		}
	]
}

describe("NominatimBboxFetcher",()=>{
	it("makes area server fetch for small area and cache miss",async()=>{
		const calls=[]
		const fetcher=new NominatimBboxFetcher(...makeFetcherInterface(calls,bboxResponse(['1','2','3','4'])))
		const result=await fetcher.fetch(
			123,`Lisbon`,
			-10.04,38.12,-7.99,39.38
		)
		const parameters=`limit=1&q=Lisbon&viewbox=-10.04%2C38.12%2C-7.99%2C39.38`
		assert.deepEqual(calls,[
			['fetchFromCache',123,parameters],
			['fetchFromServer',parameters],
			['storeToCache',123,parameters,['1','2','3','4']]
		])
		assert.deepEqual(result,['1','2','3','4'])
	})
	it("makes area cache fetch for small area and cache hit",async()=>{
		const calls=[]
		const fetcher=new NominatimBboxFetcher(...makeFetcherInterface(calls,bboxResponse(['1','2','3','4']),['1','2','3','4']))
		const result=await fetcher.fetch(
			123,`Lisbon`,
			-10.04,38.12,-7.99,39.38
		)
		const parameters=`limit=1&q=Lisbon&viewbox=-10.04%2C38.12%2C-7.99%2C39.38`
		assert.deepEqual(calls,[
			['fetchFromCache',123,parameters],
			['storeToCache',123,parameters,['1','2','3','4']]
		])
		assert.deepEqual(result,['1','2','3','4'])
	})
	it("makes no-area server fetch for huge area and cache miss",async()=>{
		const calls=[]
		const fetcher=new NominatimBboxFetcher(...makeFetcherInterface(calls,bboxResponse(['5','6','7','8'])))
		const result=await fetcher.fetch(
			456,`Madrid`,
			-258.04,-86.89,258.75,86.85
		)
		const parameters=`limit=1&q=Madrid`
		assert.deepEqual(calls,[
			['fetchFromCache',456,parameters],
			['fetchFromServer',parameters],
			['storeToCache',456,parameters,['5','6','7','8']]
		])
		assert.deepEqual(result,['5','6','7','8'])
	})
	it("makes no-area cache fetch for huge area and cache hit",async()=>{
		const calls=[]
		const fetcher=new NominatimBboxFetcher(...makeFetcherInterface(calls,bboxResponse(['5','6','7','8']),['5','6','7','8']))
		const result=await fetcher.fetch(
			456,`Madrid`,
			-258.04,-86.89,258.75,86.85
		)
		const parameters=`limit=1&q=Madrid`
		assert.deepEqual(calls,[
			['fetchFromCache',456,parameters],
			['storeToCache',456,parameters,['5','6','7','8']]
		])
		assert.deepEqual(result,['5','6','7','8'])
	})
	it("makes no-area cache fetch for negative area and cache hit",async()=>{
		const calls=[]
		const fetcher=new NominatimBboxFetcher(...makeFetcherInterface(calls,bboxResponse(['5','6','7','8']),['5','6','7','8']))
		const result=await fetcher.fetch(
			456,`Madrid`,
			-10.04,40.12,-7.99,39.38
		)
		const parameters=`limit=1&q=Madrid`
		assert.deepEqual(calls,[
			['fetchFromCache',456,parameters],
			['storeToCache',456,parameters,['5','6','7','8']]
		])
		assert.deepEqual(result,['5','6','7','8'])
	})
	it("fails on malformed fetch response",async()=>{
		const calls=[]
		const fetcher=new NominatimBboxFetcher(...makeFetcherInterface(calls,'lol'))
		try {
			await fetcher.fetch(
				123,`Lisbon`,
				-10.04,38.12,-7.99,39.38
			)
			assert.fail('no expected exception')
		} catch (ex) {
			assert(ex instanceof TypeError)
		}
	})
})
