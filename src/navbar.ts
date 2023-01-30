import type NoteViewerStorage from './storage'
import type NoteMap from './map'
import {makeElement, makeLink} from './html'
import {escapeXml, makeEscapeTag} from './escape'

const e=makeEscapeTag(escapeXml)

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
		$container.append(this.$tabList)
		if (map) $container.append(makeFlipLayoutButton(storage,map))
		$container.append(makeResetButton())
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

function makeFlipLayoutButton(storage: NoteViewerStorage, map: NoteMap): HTMLButtonElement {
	return makeButton('flip',`Flip layout`,()=>{
		document.body.classList.toggle('flipped')
		storage.setBoolean('flipped',document.body.classList.contains('flipped'))
		map.invalidateSize()
	})
}

function makeResetButton(): HTMLButtonElement {
	return makeButton('reset',`Reset query`,()=>{
		location.href=location.pathname+location.search
		// TODO this would have worked better, if it also cleared the notes table:
		// const url=location.pathname+location.search
		// location.href=url+'#'
		// history.replaceState(null,'',url)
	})
}

function makeButton(id:string, title:string, listener:()=>void) {
	const $button=document.createElement('button')
	$button.title=title
	$button.classList.add('global',id)
	$button.innerHTML=e`<svg><use href="#${id}" /></svg>`
	$button.onclick=listener
	return $button
}
