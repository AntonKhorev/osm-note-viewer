import {makeDiv, makeLabel} from './html'

export default function makeCodeForm(
	initialValue: string,
	summary: string, textareaLabel: string, buttonLabel: string,
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
	const $button=document.createElement('button')
	$textarea.value=initialValue
	const isEmpty=()=>!$textarea.value
	const updateOutput=()=>{
		$output.replaceChildren()
		if (isEmpty()) {
			$output.append(` (currently not set)`)
		}
	}
	{
		$formDetails.classList.add('with-code-form')
		$formDetails.open=!isEmpty()
		updateOutput()
		const $formSummary=document.createElement('summary')
		$formSummary.append(summary,$output)
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
		$form.append(makeDiv('major-input')(makeLabel()(
			textareaLabel,` `,$textarea
		)))
	}{
		$button.textContent=buttonLabel
		$button.type='submit'
		$button.disabled=true
		$form.append(makeDiv('major-input')($button))
	}
	$textarea.oninput=()=>{
		updateOutput()
		$button.disabled=isSameInput($textarea.value)
		try {
			checkInput($textarea.value)
			$textarea.setCustomValidity('')
		} catch (ex) {
			let message=`Syntax error`
			if (ex instanceof RangeError || ex instanceof SyntaxError) message=ex.message
			$textarea.setCustomValidity(message)
		}
	}
	$form.onsubmit=(ev)=>{
		ev.preventDefault()
		try {
			applyInput($textarea.value)
		} catch (ex) {
			return
		}
		runCallback()
		$button.disabled=true
	}
	return $formDetails
}
