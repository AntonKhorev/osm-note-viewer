import type NoteViewerStorage from './storage'
import type NoteMap from './map'
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

// https://www.w3.org/WAI/ARIA/apg/example-index/tabs/tabs-automatic.html
// https://www.w3.org/WAI/ARIA/apg/example-index/tabs/tabs-manual.html
export default class Navbar {
	private readonly $tabList=document.createElement('div')
	private readonly tabs: Map<string,[$tab:HTMLButtonElement,dialog:NavDialog]> = new Map()
	constructor(storage: NoteViewerStorage, $container: HTMLElement, map: NoteMap|undefined) {
		this.$tabList.setAttribute('role','tablist')
		this.$tabList.setAttribute('aria-label',`Note query modes`)
		if (map) $container.append(makeFlipLayoutButton(storage,map))
		$container.append(this.$tabList)
		$container.append(makeResetButton())
	}
	addTab(dialog: NavDialog, push: boolean = false) {
		const tabId='tab-'+dialog.shortTitle
		const tabPanelId='tab-panel-'+dialog.shortTitle
		const $tab=document.createElement('button')
		$tab.id=tabId
		$tab.innerText=dialog.shortTitle
		$tab.setAttribute('role','tab')
		$tab.setAttribute('aria-controls',tabPanelId)
		$tab.setAttribute('aria-selected','false')
		$tab.classList.toggle('push',push)
		dialog.$section.id=tabPanelId
		dialog.$section.tabIndex=0
		dialog.$section.hidden=true
		dialog.$section.setAttribute('role','tabpanel')
		dialog.$section.setAttribute('aria-labelledby',tabId)
		this.$tabList.append($tab)
		this.tabs.set(dialog.shortTitle,[$tab,dialog])
		$tab.addEventListener('click',ev=>{
			ev.preventDefault()
			this.openTab(dialog.shortTitle)
		})
	}
	openTab(targetShortTitle: string) {
		for (const [shortTitle,[,dialog]] of this.tabs) {
			const willBeActive=shortTitle==targetShortTitle
			if (!willBeActive && dialog.isOpen()) {
				dialog.onClose()
			}
		}
		for (const [shortTitle,[$tab,dialog]] of this.tabs) {
			const willBeActive=shortTitle==targetShortTitle
			const willCallOnOpen=(willBeActive && !dialog.isOpen())
			$tab.setAttribute('aria-selected',String(willBeActive))
			dialog.$section.hidden=!willBeActive
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
