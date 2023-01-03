import NoteViewerStorage from './storage'
import {NoteMap} from './map'
import {makeElement, makeLink} from './html'

export abstract class NavDialog {
	abstract shortTitle: string
	abstract title: string
	$section=document.createElement('section')
	write($container: HTMLElement) {
		this.$section.classList.add('nav-dialog')
		const $heading=document.createElement('h2')
		$heading.textContent=this.title
		this.$section.append($heading)
		this.writeSectionContent()
		$container.append(this.$section)
	}
	isOpen(): boolean {
		return this.$section.classList.contains('active')
	}
	onOpen(): void {}
	onClose(): void {}
	abstract writeSectionContent(): void
}

export default class Navbar {
	private readonly $tabList=document.createElement('ul')
	private readonly tabs: Map<string,[$navlink:HTMLAnchorElement,dialog:NavDialog]> = new Map()
	constructor(storage: NoteViewerStorage, $container: HTMLElement, map: NoteMap|undefined) {
		$container.append(
			this.$tabList,
			makeFlipLayoutButton(storage,map),
			makeResetButton()
		)
	}
	addTab(dialog: NavDialog, push: boolean = false) {
		const id='section-'+dialog.shortTitle
		dialog.$section.id=id
		const $a=makeLink(dialog.shortTitle,'#'+id)
		this.$tabList.append(makeElement('li')(...(push?['push']:[]))($a))
		this.tabs.set(dialog.shortTitle,[$a,dialog])
		$a.addEventListener('click',ev=>{
			ev.preventDefault()
			this.openTab(dialog.shortTitle)
		})
	}
	openTab(targetShortTitle: string) {
		for (const [shortTitle,[$a,dialog]] of this.tabs) {
			const willBeActive=shortTitle==targetShortTitle
			if (!willBeActive && dialog.isOpen()) {
				dialog.onClose()
			}
		}
		for (const [shortTitle,[$a,dialog]] of this.tabs) {
			const willBeActive=shortTitle==targetShortTitle
			const willCallOnOpen=(willBeActive && !dialog.isOpen())
			$a.classList.toggle('active',willBeActive)
			dialog.$section.classList.toggle('active',willBeActive)
			if (willCallOnOpen) {
				dialog.onOpen()
			}
		}
	}
}

function makeFlipLayoutButton(storage: NoteViewerStorage, map: NoteMap|undefined): HTMLButtonElement {
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
		if (map) map.invalidateSize()
	})
	return $button
}

function makeResetButton(): HTMLButtonElement {
	const $button=document.createElement('button')
	$button.classList.add('global','reset')
	$button.innerHTML=`<svg><title>Reset query</title><use href="#reset" /></svg>`
	$button.addEventListener('click',()=>{
		location.href=location.pathname+location.search
		// TODO this would have worked better, if it also cleared the notes table:
		// const url=location.pathname+location.search
		// location.href=url+'#'
		// history.replaceState(null,'',url)
	})
	return $button
}
