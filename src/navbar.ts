import type {SimpleStorage} from './util/storage'
import {setStorageBoolean} from './util/storage'
import type NoteMap from './map'
import {escapeXml, makeEscapeTag} from './util/escape'

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
		return !this.$section.hidden
	}
	onOpen(): void {}
	onClose(): void {}
	abstract writeSectionContent(): void
}

// https://www.w3.org/WAI/ARIA/apg/example-index/tabs/tabs-automatic.html
// https://www.w3.org/WAI/ARIA/apg/example-index/tabs/tabs-manual.html
export default class Navbar {
	private readonly $tabList=document.createElement('div')
	private readonly tabs: Map<NavDialog,HTMLButtonElement> = new Map()
	constructor($root: HTMLElement, storage: SimpleStorage, $container: HTMLElement, map: NoteMap|undefined) {
		this.$tabList.setAttribute('role','tablist')
		this.$tabList.setAttribute('aria-label',`Note query modes`)
		if (map) $container.append(makeFlipLayoutButton($root,storage,map))
		$container.append(this.$tabList)
		$container.append(makeResetButton())
		$container.onkeydown=ev=>{
			const $button=ev.target
			if (!($button instanceof HTMLButtonElement)) return
			const focusButton=(c:number,o:number)=>{
				const $buttons=[...$container.querySelectorAll('button')]
				const i=$buttons.indexOf($button)
				const l=$buttons.length
				if (l<=0 || i<0) return
				$buttons[(l+i*c+o)%l].focus()
			}
			if (ev.key=='ArrowLeft') {
				focusButton(1,-1)
			} else if (ev.key=='ArrowRight') {
				focusButton(1,+1)
			} else if (ev.key=='Home') {
				focusButton(0,0)
			} else if (ev.key=='End') {
				focusButton(0,-1)
			} else {
				return
			}
			ev.stopPropagation()
			ev.preventDefault()
		}
	}
	addTab(dialog: NavDialog, push: boolean = false) {
		const tabId='tab-'+dialog.shortTitle
		const tabPanelId='tab-panel-'+dialog.shortTitle
		const $tab=document.createElement('button')
		$tab.id=tabId
		$tab.tabIndex=-1
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
		this.tabs.set(dialog,$tab)
		$tab.onclick=()=>{
			this.openTab(dialog)
		}
	}
	openTab(targetDialog: NavDialog) {
		for (const [dialog] of this.tabs) {
			const willBeActive=dialog==targetDialog
			if (!willBeActive && dialog.isOpen()) {
				dialog.onClose()
			}
		}
		for (const [dialog,$tab] of this.tabs) {
			const willBeActive=dialog==targetDialog
			const willCallOnOpen=(willBeActive && !dialog.isOpen())
			$tab.setAttribute('aria-selected',String(willBeActive))
			$tab.tabIndex=willBeActive?0:-1
			dialog.$section.hidden=!willBeActive
			if (willCallOnOpen) {
				dialog.onOpen()
			}
		}
	}
}

function makeFlipLayoutButton($root: HTMLElement, storage: SimpleStorage, map: NoteMap): HTMLButtonElement {
	return makeButton('flip',`Flip layout`,()=>{
		const hasFlipped=$root.classList.toggle('flipped')
		setStorageBoolean(storage,'flipped',hasFlipped)
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
	$button.tabIndex=-1
	$button.title=title
	$button.classList.add('global',id)
	$button.innerHTML=e`<svg><use href="#${id}" /></svg>`
	$button.onclick=listener
	return $button
}
