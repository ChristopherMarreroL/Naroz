/// <reference lib="webworker" />

import DocxMerger from 'docx-merger'

interface DocxMergeRequest {
  buffers: ArrayBuffer[]
}

interface DocxMergeResponse {
  buffer?: ArrayBuffer
  error?: string
}

const workerScope = self as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<DocxMergeRequest>) => {
  try {
    const merger = new DocxMerger({ pageBreak: true }, event.data.buffers)
    merger.save('arraybuffer', (buffer) => {
      const response: DocxMergeResponse = { buffer }
      workerScope.postMessage(response, [buffer])
    })
  } catch {
    const response: DocxMergeResponse = {
      error: 'DOCX_MERGE_FAILED',
    }
    workerScope.postMessage(response)
  }
}

export {}
