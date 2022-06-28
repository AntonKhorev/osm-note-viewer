import NoteViewerStorage from './storage'
import {NoteMap} from './map'
import {makeElement, makeLink} from './util'

export default class Navbar {
	private readonly $tabList=document.createElement('ul')
	private readonly tabs: Map<string,[$navlink:HTMLAnchorElement,$section:HTMLElement]> = new Map()
	constructor(storage: NoteViewerStorage, $container: HTMLElement, map: NoteMap) {
		$container.append(
			this.$tabList,
			makeFlipLayoutButton(storage,map),
			makeResetButton()
		)
	}
	addTab(shortTitle: string, $section: HTMLElement) {
		const id='section-'+shortTitle
		$section.id=id
		const $a=makeLink(shortTitle,'#'+id)
		this.$tabList.append(makeElement('li')()($a))
		this.tabs.set(shortTitle,[$a,$section])
		$a.addEventListener('click',ev=>{
			ev.preventDefault()
			this.openTab(shortTitle)
		})
	}
	openTab(targetShortTitle: string) {
		for (const [shortTitle,[$a,$section]] of this.tabs) {
			const isActive=shortTitle==targetShortTitle
			$a.classList.toggle('active',isActive)
			$section.classList.toggle('active',isActive)
		}
	}
}

function makeFlipLayoutButton(storage: NoteViewerStorage, map: NoteMap): HTMLButtonElement {
	const $button=document.createElement('button')
	$button.classList.add('global','flip')
	$button.innerHTML=`<svg><title>Flip layout</title><use href="#flip" /></svg>`
	$button.addEventListener('click',()=>{
		document.body.classList.toggle('flipped')
		if (document.body.classList.contains('flipped')) {
			storage.setItem('flipped','1')
		} else {
			storage.removeItem('flipped')
		}
		map.invalidateSize()
	})
	return $button
}

function makeResetButton(): HTMLButtonElement {
	const $button=document.createElement('button')
	$button.classList.add('global','reset')
	$button.innerHTML=`<svg><title>Reset query</title><use href="#reset" /></svg>`
	$button.addEventListener('click',()=>{
		location.href=location.pathname+location.search
	})
	return $button
}
