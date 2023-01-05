import {makeDiv, makeLabel} from './html'

export default function makeCodeForm(
	textareaLabel: string, buttonLabel: string,
	isSameInput: (input:string)=>boolean,
	checkInput: (input:string)=>void,
	applyInput: (input:string)=>void,
	runCallback: ()=>void,
	syntaxDescription: string, syntaxExamples: [string,string[]][]
): HTMLFormElement {
	const $form=document.createElement('form')
	const $textarea=document.createElement('textarea')
	const $button=document.createElement('button')
	{
		const $details=document.createElement('details')
		$details.innerHTML=syntaxDescription
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
		$details.append($examplesTitle,$examplesList)
		$form.append($details)
	}{
		$textarea.rows=5
		$form.append(makeDiv('major-input')(makeLabel()(
			`${textareaLabel}: `,$textarea
		)))
	}{
		$button.textContent=buttonLabel
		$button.type='submit'
		$button.disabled=true
		$form.append(makeDiv('major-input')($button))
	}
	$textarea.addEventListener('input',()=>{
		$button.disabled=isSameInput($textarea.value)
		try {
			checkInput($textarea.value)
			$textarea.setCustomValidity('')
		} catch (ex) {
			let message=`Syntax error`
			if (ex instanceof RangeError) message=ex.message
			$textarea.setCustomValidity(message)
		}
	})
	$form.addEventListener('submit',(ev)=>{
		ev.preventDefault()
		try {
			applyInput($textarea.value)
		} catch (ex) {
			return
		}
		runCallback()
		$button.disabled=true
	})
	return $form
}
