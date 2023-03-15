import {makeDiv} from '../html'

export function makePopupWriter(
	popupContents: HTMLElement[],
	clear: ()=>void
) {
	return (layer: L.Layer)=>{
		const $removeButton=document.createElement('button')
		$removeButton.textContent=`Remove from map view`
		$removeButton.onclick=clear
		return makeDiv('osm-element-popup-contents')(
			...popupContents,$removeButton
		)
	}
}
