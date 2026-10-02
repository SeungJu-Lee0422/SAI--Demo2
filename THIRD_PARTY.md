# Research and open-source components

Local Demo additions:
- Google OR-Tools 9.15.6755 (Apache-2.0): https://developers.google.com/optimization ; true CP-SAT set partitioning runs in the project Python environment.
- Mozilla PDF.js / pdfjs-dist 6.3.289 (Apache-2.0): https://github.com/mozilla/pdf.js ; extracts text from actual LinkedIn profile PDFs locally.
- The demo's user-topic classifier uses Qwen3-Embedding-0.6B ONNX q8 and an explicit 32-topic bilingual taxonomy. Raw evidence is preserved. Demo fixtures are labeled as examples; they are not fetched account data.

The matching pipeline is this app's implementation. It does not claim that a research paper validated this app's social outcomes.

- Microsoft Multilingual E5: https://github.com/microsoft/unilm/tree/master/e5
- Research report: https://arxiv.org/abs/2402.05672
- Original model: https://huggingface.co/intfloat/multilingual-e5-small (MIT)
- ONNX conversion: https://huggingface.co/Xenova/multilingual-e5-small (MIT)
- Runtime: https://github.com/huggingface/transformers.js (Apache-2.0)
- OCR: https://github.com/naptha/tesseract.js (Apache-2.0)
- Conversation-topic study informing the design: Nguyen et al., The Known Stranger, CHI 2015, https://doi.org/10.1145/2702123.2702411

Exact matches use canonical IDs. Semantic retrieval uses normalized last-token Qwen3 vectors, same-category cross-user pair comparison, and cosine similarity. Symmetric interest comparison embeds both items as plain category-and-interest text. A provisional 0.75 threshold generates candidates only; it has not been calibrated to shared-interest labels. Pair links are not transitively merged into an all-group claim. Results include the original input evidence.

API credentials remain server-side. Basic direct matching uses exact/taxonomy rules. Qwen3-Embedding-0.6B runs in the browser, local Node server, and Vercel Node functions for semantic comparison and topic validation. Vercel loads pinned q8 weights into memory and performs native ONNX CPU inference. Playlist OCR has been removed.

Current embedding model: Qwen/Qwen3-Embedding-0.6B (Apache-2.0), https://huggingface.co/Qwen/Qwen3-Embedding-0.6B
Technical report: Zhang et al., Qwen3 Embedding: Advancing Text Embedding and Reranking Through Foundation Models, https://arxiv.org/abs/2506.05176 (Section 2, last-token embedding).
ONNX conversion: https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX
The earlier E5 references document the baseline, which is no longer the production embedding model. This app uses pretrained weights, not the paper’s training pipeline, and its social matching threshold is not validated by the paper.

Browser text extraction: Qwen/Qwen3-0.6B (Apache-2.0), https://huggingface.co/Qwen/Qwen3-0.6B; ONNX conversion https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX. Chat template is used with thinking disabled, greedy generation, and a 256-token output limit. Extracted labels are checked against the input and require user confirmation. This is a generative model separate from Qwen3-Embedding-0.6B.

Generative taste extraction: `onnx-community/Qwen3-0.6B-ONNX`, derived from Qwen/Qwen3-0.6B, Apache-2.0. Runs locally in the browser through Transformers.js; model weights fetched from Hugging Face. Generation and embedding models are separate downloads.
