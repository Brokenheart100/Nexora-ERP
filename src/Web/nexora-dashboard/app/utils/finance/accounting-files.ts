const maxFileBytes = 256 * 1024

export function validateAccountingFile(text: string) {
  if (!text.trim()) throw new Error('请选择文件或输入内容。')
  if (new TextEncoder().encode(text).length > maxFileBytes) throw new Error('文件不能超过 256 KiB。')
  return text
}

export async function readAccountingFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.item(0)
  input.value = ''
  if (!file) return null
  if (file.size > maxFileBytes) throw new Error('文件不能超过 256 KiB。')
  return validateAccountingFile(await file.text())
}
