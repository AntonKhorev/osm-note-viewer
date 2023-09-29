import {makeDiv, makeLabel} from './html'

export default function makeCodeForm(
	initialValue: string,
	stashedValue: string,
	summary: (string|HTMLElement)[], textareaLabel: string, applyButtonLabel: string,
	isSameInput: (input:string)=>boolean,
	checkInput: (input:string)=>void,
	applyInput: (input:string)=>void,
	runCallback: ()=>void,
	syntaxDescription: string, syntaxExamples: [string,string[]][]
): HTMLDetailsElement {
	const $formDetails=document.createElement('details')
	const $form=document.createElement('form')
	const $output=document.createElement('output')
	const $textarea=document.createElement('textarea')
	const $applyButton=document.createElement('button')
	const $clearButton=document.createElement('button')
	const $undoClearButton=document.createElement('button')
	$textarea.value=initialValue
	const isEmpty=()=>!$textarea.value
	const canUndoClear=()=>!!stashedValue && isEmpty()
	const reactToChanges=()=>{
		const isSame=isSameInput($textarea.value)
		$output.replaceChildren()
		if (!isSame) {
			$output.append(` (with unapplied changes)`)
		} else if (isEmpty()) {
			$output.append(` (currently not set)`)
		}
		$applyButton.disabled=isSame
		$clearButton.disabled=isEmpty()
		$undoClearButton.hidden=!($clearButton.hidden=canUndoClear())
		try {
			checkInput($textarea.value)
			$textarea.setCustomValidity('')
		} catch (ex) {
			let message=`Syntax error`
			if (ex instanceof RangeError || ex instanceof SyntaxError) message=ex.message
			$textarea.setCustomValidity(message)
		}
	}
	reactToChanges()
	{
		$formDetails.classList.add('with-code-form')
		$formDetails.open=!isEmpty()
		const $formSummary=document.createElement('summary')
		$formSummary.append(...summary,$output)
		$formDetails.append($formSummary,$form)
	}{
		const $syntaxDetails=document.createElement('details')
		$syntaxDetails.classList.add('syntax')
		$syntaxDetails.innerHTML=syntaxDescription
		const $examplesTitle=document.createElement('p')
		$examplesTitle.innerHTML='<strong>Examples</strong>:'
		const $examplesList=document.createElement('dl')
		$examplesList.classList.add('examples')
		for (const [title,codeLines] of syntaxExamples) {
			const $dt=document.createElement('dt')
			$dt.append(title)
			const $dd=document.createElement('dd')
			const $code=document.createElement('code')
			$code.textContent=codeLines.join('\n')
			$dd.append($code)
			$examplesList.append($dt,$dd)
		}
		$syntaxDetails.append($examplesTitle,$examplesList)
		$form.append($syntaxDetails)
	}{
		$textarea.rows=5
		$form.append(makeDiv('input-group','major')(makeLabel()(
			textareaLabel,` `,$textarea
		)))
	}{
		$applyButton.textContent=applyButtonLabel
		$clearButton.textContent=`Clear`
		$clearButton.classList.add('danger')
		$undoClearButton.textContent=`Restore previous`
		$undoClearButton.type=$clearButton.type='button'
		$form.append(makeDiv('input-group','gridded')(
			$applyButton,$clearButton,$undoClearButton
		))
	}
	$textarea.oninput=reactToChanges
	$clearButton.onclick=()=>{
		stashedValue=$textarea.value
		$textarea.value=''
		$undoClearButton.textContent=`Undo clear`
		reactToChanges()
	}
	$undoClearButton.onclick=()=>{
		$textarea.value=stashedValue
		reactToChanges()
	}
	$form.onsubmit=(ev)=>{
		ev.preventDefault()
		try {
			applyInput($textarea.value)
		} catch (ex) {
			return
		}
		runCallback()
		reactToChanges()
	}
	return $formDetails
}
