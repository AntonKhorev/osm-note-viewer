import {makeLink} from './util'

export default class CommandPanel {
	$trackCheckbox: HTMLInputElement
	$loadNotesButton: HTMLButtonElement
	$loadMapButton: HTMLButtonElement
	$yandexPanoramasButton: HTMLButtonElement
	constructor($container: HTMLElement) {
		this.$trackCheckbox=document.createElement('input')
		this.$loadNotesButton=document.createElement('button')
		this.$loadMapButton=document.createElement('button')
		this.$yandexPanoramasButton=document.createElement('button')
		{
			const $div=document.createElement('div')
			const $label=document.createElement('label')
			this.$trackCheckbox.type='checkbox'
			$label.append(this.$trackCheckbox,` track visible notes on the map`)
			$div.append($label)
			$container.append($div)
		}{
			const $div=document.createElement('div')
			this.$loadNotesButton.disabled=true
			this.$loadNotesButton.textContent=`Load selected notes`
			this.$loadMapButton.textContent=`Load map area`
			$div.append(
				makeLink(`RC`,'https://wiki.openstreetmap.org/wiki/JOSM/RemoteControl',`JOSM (or another editor) Remote Control`),
				`: `,
				this.$loadNotesButton,
				` `,
				this.$loadMapButton
			)
			$container.append($div)
		}{
			const $div=document.createElement('div')
			this.$yandexPanoramasButton.textContent=`Open map center`
			$div.append(
				makeLink(`Y.Panoramas`,'https://wiki.openstreetmap.org/wiki/RU:%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F/%D0%AF%D0%BD%D0%B4%D0%B5%D0%BA%D1%81.%D0%9F%D0%B0%D0%BD%D0%BE%D1%80%D0%B0%D0%BC%D1%8B',`Yandex.Panoramas (Яндекс.Панорамы)`),
				`: `,
				this.$yandexPanoramasButton
			)
			$container.append($div)
		}
	}
}
