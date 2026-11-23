export async function requireInvoicePdf(blob: Blob) {
  if (blob.type.split(';')[0]?.trim().toLowerCase() !== 'application/pdf'
    || await blob.slice(0, 5).text() !== '%PDF-')
    throw new Error('发票 PDF 响应无效。')
  return blob
}

export function saveInvoicePdf(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'Nexora-invoice.pdf'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
