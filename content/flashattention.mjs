// Source of truth for the FlashAttention paper, authored as block objects.
// scripts/build-paper.mjs compiles this into public/papers/flashattention/paper.json,
// which the app fetches and renders at runtime.
//
// Inline markup inside any `text` string:
//   $...$            inline math (KaTeX)
//   [@3, 9, 92]      citation(s) → hover card
//   [#id:Label]      cross-reference to a block id
//   [^1]             footnote
//   [text](url)      external link
//   **bold**  *italic*

const r = String.raw;

const h = (level, number, title, id) => ({ type: "heading", level, number, title, id });
const p = (text, lead) => (lead ? { type: "paragraph", lead, text } : { type: "paragraph", text });
const eq = (tex, opts = {}) => ({ type: "equation", tex, ...opts });
const list = (items, ordered = false) => ({ type: "list", ordered, items });
const L = (indent, text) => ({ indent, text });

const RN = r`\mathbb{R}`;

// ────────────────────────────────────────────────────────────────────────────
// Shared algorithm fragments
// ────────────────────────────────────────────────────────────────────────────
const blockSizes = r`Set block sizes $B_c = \left\lceil \frac{M}{4d} \right\rceil,\; B_r = \min\left(\left\lceil \frac{M}{4d} \right\rceil, d\right)$.`;
const initOLM = r`Initialize $\mathbf{O} = (0)_{N \times d} \in \mathbb{R}^{N \times d},\; \ell = (0)_N \in \mathbb{R}^{N},\; m = (-\infty)_N \in \mathbb{R}^{N}$ in HBM.`;
const divideQKV = r`Divide $\mathbf{Q}$ into $T_r = \left\lceil \frac{N}{B_r} \right\rceil$ blocks $\mathbf{Q}_1, \dots, \mathbf{Q}_{T_r}$ of size $B_r \times d$ each, and divide $\mathbf{K}, \mathbf{V}$ in to $T_c = \left\lceil \frac{N}{B_c} \right\rceil$ blocks $\mathbf{K}_1, \dots, \mathbf{K}_{T_c}$ and $\mathbf{V}_1, \dots, \mathbf{V}_{T_c}$, of size $B_c \times d$ each.`;
const divideOLM = r`Divide $\mathbf{O}$ into $T_r$ blocks $\mathbf{O}_1, \dots, \mathbf{O}_{T_r}$ of size $B_r \times d$ each, divide $\ell$ into $T_r$ blocks $\ell_1, \dots, \ell_{T_r}$ of size $B_r$ each, divide $m$ into $T_r$ blocks $m_1, \dots, m_{T_r}$ of size $B_r$ each.`;
const forJ = r`**for** $1 \le j \le T_c$ **do**`;
const forI = r`**for** $1 \le i \le T_r$ **do**`;
const loadKV = r`Load $\mathbf{K}_j, \mathbf{V}_j$ from HBM to on-chip SRAM.`;
const loadQOLM = r`Load $\mathbf{Q}_i, \mathbf{O}_i, \ell_i, m_i$ from HBM to on-chip SRAM.`;
const statsNew = r`On chip, compute $m_i^{\text{new}} = \max(m_i, \tilde{m}_{ij}) \in \mathbb{R}^{B_r}$, $\ell_i^{\text{new}} = e^{m_i - m_i^{\text{new}}} \ell_i + e^{\tilde{m}_{ij} - m_i^{\text{new}}} \tilde{\ell}_{ij} \in \mathbb{R}^{B_r}$.`;
const writeLM = r`Write $\ell_i \leftarrow \ell_i^{\text{new}}$, $m_i \leftarrow m_i^{\text{new}}$ to HBM.`;

const maskedFwdBody = (indent) => [
  L(indent, r`On chip, compute $\mathbf{S}_{ij} = \tau \mathbf{Q}_i \mathbf{K}_j^T \in \mathbb{R}^{B_r \times B_c}$.`),
  L(indent, r`On chip, compute $\mathbf{S}_{ij}^{\text{masked}} = \operatorname{MASK}(\mathbf{S}_{ij})$.`),
  L(indent, r`On chip, compute $\tilde{m}_{ij} = \mathrm{rowmax}(\mathbf{S}_{ij}^{\text{masked}}) \in \mathbb{R}^{B_r}$, $\tilde{\mathbf{P}}_{ij} = \exp(\mathbf{S}_{ij}^{\text{masked}} - \tilde{m}_{ij}) \in \mathbb{R}^{B_r \times B_c}$ (pointwise), $\tilde{\ell}_{ij} = \mathrm{rowsum}(\tilde{\mathbf{P}}_{ij}) \in \mathbb{R}^{B_r}$.`),
  L(indent, statsNew),
  L(indent, r`On chip, compute $\tilde{\mathbf{P}}_{ij}^{\text{dropped}} = \mathrm{dropout}(\tilde{\mathbf{P}}_{ij}, p_{\text{drop}})$.`),
  L(indent, r`Write $\mathbf{O}_i \leftarrow \mathrm{diag}(\ell_i^{\text{new}})^{-1}\left(\mathrm{diag}(\ell_i) e^{m_i - m_i^{\text{new}}} \mathbf{O}_i + e^{\tilde{m}_{ij} - m_i^{\text{new}}} \tilde{\mathbf{P}}_{ij}^{\text{dropped}} \mathbf{V}_j\right)$ to HBM.`),
  L(indent, writeLM),
];

// ────────────────────────────────────────────────────────────────────────────
// Benchmark-table metadata (numbers come from benchmark-tables.json)
// ────────────────────────────────────────────────────────────────────────────
const benchCaption = {
  9: "Forward pass runtime (ms) of various exact/approximate/sparse attention mechanisms by sequence length, **with dropout and masking**.",
  10: "Backward pass runtime (ms) of various exact/approximate/sparse attention mechanisms by sequence length, **with dropout and masking**.",
  11: "Forward pass + backward pass runtime (ms) of various exact/approximate/sparse attention mechanisms by sequence length, **with dropout and masking**.",
  12: "Forward pass runtime (ms) of various exact/approximate/sparse attention mechanisms by sequence length, **with masking**.",
  13: "Backward pass runtime (ms) of various exact/approximate/sparse attention mechanisms by sequence length, **with masking**.",
  14: "Forward pass + backward pass runtime (ms) of various exact/approximate/sparse attention mechanisms by sequence length, **with masking**.",
  15: "Forward pass runtime (ms) of various exact/approximate/sparse attention mechanisms by sequence length, **with dropout**.",
  16: "Backward pass runtime (ms) of various exact/approximate/sparse attention mechanisms by sequence length, **with dropout**.",
  17: "Forward pass + backward pass runtime (ms) of various exact/approximate/sparse attention mechanisms by sequence length, **with dropout**.",
  18: "Forward pass runtime (ms) of various exact/approximate/sparse attention mechanisms by sequence length.",
  19: "Backward pass runtime (ms) of various exact/approximate/sparse attention mechanisms by sequence length.",
  20: "Forward pass + backward pass runtime (ms) of various exact/approximate/sparse attention mechanisms by sequence length.",
  21: "Memory usage (MB) of various exact/approximate/sparse attention mechanisms by sequence length.",
};
export const benchmarkTableIds = Object.keys(benchCaption).map(Number);
export const benchmarkCaption = (n) => benchCaption[n] + " Best in **bold**, second best underlined.";

// ────────────────────────────────────────────────────────────────────────────
// Paper
// ────────────────────────────────────────────────────────────────────────────
export default {
  id: "flashattention",
  meta: {
    title: "FlashAttention",
    subtitle: "Fast and Memory-Efficient Exact Attention with IO-Awareness",
    arxiv: "2205.14135v2",
    subjects: ["cs.LG"],
    date: "2022-06-24",
    dateLabel: "June 24, 2022",
    code: "https://github.com/HazyResearch/flash-attention",
    pdf: "https://arxiv.org/pdf/2205.14135v2",
    authors: [
      { name: "Tri Dao", affiliations: [1], email: "trid@cs.stanford.edu" },
      { name: "Daniel Y. Fu", affiliations: [1], email: "danfu@cs.stanford.edu" },
      { name: "Stefano Ermon", affiliations: [1], email: "ermon@stanford.edu" },
      { name: "Atri Rudra", affiliations: [2], email: "atri@buffalo.edu" },
      { name: "Christopher Ré", affiliations: [1], email: "chrismre@cs.stanford.edu" },
    ],
    affiliations: [
      { id: 1, name: "Department of Computer Science, Stanford University" },
      { id: 2, name: "Department of Computer Science and Engineering, University at Buffalo, SUNY" },
    ],
    // Headline numbers, all quoted from the abstract.
    highlights: [
      { value: "15%", label: "faster BERT-large training vs. the MLPerf 1.1 record", target: "tab1" },
      { value: "3×", label: "end-to-end speedup on GPT-2 (seq. length 1K)", target: "tab2" },
      { value: "2.4×", label: "speedup on Long-Range Arena (seq. 1K–4K)", target: "tab3" },
      { value: "61.4%", label: "Path-X accuracy — first better-than-chance Transformer", target: "tab6" },
    ],
  },

  abstract: r`Transformers are slow and memory-hungry on long sequences, since the time and memory complexity of self-attention are quadratic in sequence length. Approximate attention methods have attempted to address this problem by trading off model quality to reduce the compute complexity, but often do not achieve wall-clock speedup. We argue that a missing principle is making attention algorithms *IO-aware*—accounting for reads and writes between levels of GPU memory. We propose FlashAttention, an IO-aware exact attention algorithm that uses tiling to reduce the number of memory reads/writes between GPU high bandwidth memory (HBM) and GPU on-chip SRAM. We analyze the IO complexity of FlashAttention, showing that it requires fewer HBM accesses than standard attention, and is optimal for a range of SRAM sizes. We also extend FlashAttention to block-sparse attention, yielding an approximate attention algorithm that is faster than any existing approximate attention method. FlashAttention trains Transformers faster than existing baselines: 15% end-to-end wall-clock speedup on BERT-large (seq. length 512) compared to the MLPerf 1.1 training speed record, 3× speedup on GPT-2 (seq. length 1K), and 2.4× speedup on long-range arena (seq. length 1K–4K). FlashAttention and block-sparse FlashAttention enable longer context in Transformers, yielding higher quality models (0.7 better perplexity on GPT-2 and 6.4 points of lift on long-document classification) and entirely new capabilities: the first Transformers to achieve better-than-chance performance on the Path-X challenge (seq. length 16K, 61.4% accuracy) and Path-256 (seq. length 64K, 63.1% accuracy).`,

  footnotes: {
    1: r`FlashAttention code is available at [github.com/HazyResearch/flash-attention](https://github.com/HazyResearch/flash-attention)`,
    2: r`This style of aggregation is called *algebraic aggregation* [@33].`,
    3: r`LRA accuracy results are known to be highly dependent on the tuning procedure [@90]. Our reproduced baselines perform better than as reported in the original comparison [@80].`,
    4: r`Path-256 requires longer sequences but has relatively shorter paths than Path-X, so it is easier to obtain a higher accuracy.`,
  },

  blocks: [
    // ── 1 Introduction ─────────────────────────────────────────────────────
    h(1, "1", "Introduction", "sec-1"),
    p(r`Transformer models [@82] have emerged as the most widely used architecture in applications such as natural language processing and image classification. Transformers have grown larger [@5] and deeper [@83], but equipping them with longer context remains difficult [@80], since the self-attention module at their heart has time and memory complexity quadratic in sequence length. An important question is whether making attention faster and more memory-efficient can help Transformer models address their runtime and memory challenges for long sequences.`),
    p(r`Many approximate attention methods have aimed to reduce the compute and memory requirements of attention. These methods range from sparse-approximation [@51, 74] to low-rank approximation [@12, 50, 84], and their combinations [@3, 9, 92]. Although these methods reduce the compute requirements to linear or near-linear in sequence length, many of them do not display wall-clock speedup against standard attention and have not gained wide adoption. One main reason is that they focus on FLOP reduction (which may not correlate with wall-clock speed) and tend to ignore overheads from memory access (IO).`),
    p(r`In this paper, we argue that a missing principle is making attention algorithms *IO-aware* [@1]—that is, carefully accounting for reads and writes to different levels of fast and slow memory (e.g., between fast GPU on-chip SRAM and relatively slow GPU high bandwidth memory, or HBM [@45], [#fig1:Figure 1] left). On modern GPUs, compute speed has out-paced memory speed [@61, 62, 63], and most operations in Transformers are bottlenecked by memory accesses [@43]. IO-aware algorithms have been critical for similar memory-bound operations, when reading and writing data can account for a large portion of the runtime—such as database joins [@71], image processing [@70], numerical linear algebra [@4], and more [@40, 85]. However, common Python interfaces to deep learning such as PyTorch and Tensorflow do not allow fine-grained control of memory access.`),
    {
      type: "figure",
      id: "fig1",
      number: "1",
      images: [{ src: "figures/fig1.png", alt: "Left: memory hierarchy pyramid (SRAM 19 TB/s, 20 MB; HBM 1.5 TB/s, 40 GB; CPU DRAM 12.8 GB/s, >1 TB). Middle: FlashAttention tiling diagram with outer loop over K and V blocks and inner loop over Q blocks. Right: stacked bar chart of attention time on GPT-2, PyTorch (~17 ms: matmul, dropout, softmax, mask, matmul) versus FlashAttention fused kernel (~2 ms)." }],
      caption: r`**Left:** FlashAttention uses tiling to prevent materialization of the large $N \times N$ attention matrix (dotted box) on (relatively) slow GPU HBM. In the outer loop (red arrows), FlashAttention loops through blocks of the $\mathbf{K}$ and $\mathbf{V}$ matrices and loads them to fast on-chip SRAM. In each block, FlashAttention loops over blocks of $\mathbf{Q}$ matrix (blue arrows), loading them to SRAM, and writing the output of the attention computation back to HBM. **Right:** Speedup over the PyTorch implementation of attention on GPT-2. FlashAttention does not read and write the large $N \times N$ attention matrix to HBM, resulting in an 7.6× speedup on the attention computation.`,
      wide: true,
    },
    p(r`We propose FlashAttention, a new attention algorithm that computes exact attention with far fewer memory accesses. Our main goal is to avoid reading and writing the attention matrix to and from HBM. This requires (i) computing the softmax reduction without access to the whole input (ii) not storing the large intermediate attention matrix for the backward pass. We apply two well-established techniques to address these challenges. (i) We restructure the attention computation to split the input into blocks and make several passes over input blocks, thus incrementally performing the softmax reduction (also known as **tiling**). (ii) We store the softmax normalization factor from the forward pass to quickly **recompute** attention on-chip in the backward pass, which is faster than the standard approach of reading the intermediate attention matrix from HBM. We implement FlashAttention in CUDA to achieve fine-grained control over memory access and fuse all the attention operations into one GPU kernel. Even with the increased FLOPs due to recomputation, our algorithm both **runs faster** (up to 7.6x on GPT-2 [@67], [#fig1:Figure 1] right) and **uses less memory**—linear in sequence length—than standard attention, thanks to the massively reduced amount of HBM access.`),
    p(r`We analyze the IO complexity [@1] of FlashAttention, proving that it requires $O(N^2 d^2 M^{-1})$ HBM accesses where $d$ is the head dimension and $M$ is the size of SRAM, as compared to $\Omega(Nd + N^2)$ of standard attention. For typical values of $d$ and $M$, FlashAttention requires many times fewer HBM accesses compared to standard attention (up to 9× fewer, as shown in [#fig2:Fig. 2]). Moreover, we provide a lower bound, showing that no exact attention algorithm can asymptotically improve on the number of HBM accesses over all SRAM sizes.`),
    p(r`We also show that FlashAttention can serve as a useful primitive for realizing the potential of approximate attention algorithms by overcoming their issues with memory access overhead. As a proof of concept, we implement block-sparse FlashAttention, a sparse attention algorithm that is 2-4× faster than even FlashAttention, scaling up to sequence length of 64k. We prove that block-sparse FlashAttention has better IO complexity than FlashAttention by a factor proportional to the sparsity ratio. We discuss further extensions to other operations (attention on multi-GPU, kernel regression, block-sparse matrix multiply) in [#sec-5:Section 5]. We open-source FlashAttention to make it easier to build on this primitive.[^1]`),
    p(r`We empirically validate that FlashAttention speeds up model training and improves model quality by modeling longer context. We also benchmark the runtime and memory footprint of FlashAttention and block-sparse FlashAttention compared to prior attention implementations.`),
    list([
      { lead: "Faster Model Training.", text: r`FlashAttention trains Transformer models faster in wall-clock time. We train BERT-large (seq. length 512) 15% faster than the training speed record in MLPerf 1.1 [@58], GPT2 (seq. length 1K) 3× faster than baseline implementations from HuggingFace [@87] and Megatron-LM [@77], and long-range arena (seq. length 1K-4K) 2.4× faster than baselines.` },
      { lead: "Higher Quality Models.", text: r`FlashAttention scales Transformers to longer sequences, which improves their quality and enables new capabilities. We observe a 0.7 improvement in perplexity on GPT-2 and 6.4 points of lift from modeling longer sequences on long-document classification [@13]. FlashAttention enables the first Transformer that can achieve better-than-chance performance on the Path-X [@80] challenge, solely from using a longer sequence length (16K). Block-sparse FlashAttention enables a Transformer to scale to even longer sequences (64K), resulting in the first model that can achieve better-than-chance performance on Path-256.` },
      { lead: "Benchmarking Attention.", text: r`FlashAttention is up to 3× faster than the standard attention implementation across common sequence lengths from 128 to 2K and scales up to 64K. Up to sequence length of 512, FlashAttention is both faster and more memory-efficient than any existing attention method, whereas for sequence length beyond 1K, some approximate attention methods (e.g., Linformer) start to become faster. On the other hand, block-sparse FlashAttention is faster than all existing approximate attention methods that we know of.` },
    ]),

    // ── 2 Background ───────────────────────────────────────────────────────
    h(1, "2", "Background", "sec-2"),
    p(r`We provide some background on the performance characteristics of common deep learning operations on modern hardware (GPUs). We also describe the standard implementation of attention.`),
    h(2, "2.1", "Hardware Performance", "sec-2-1"),
    p(r`We focus here on GPUs. Performance on other hardware accelerators are similar [@46, 48].`),
    p(r`The GPU memory hierarchy ([#fig1:Fig. 1] left) comprises multiple forms of memory of different sizes and speeds, with smaller memory being faster. As an example, the A100 GPU has 40-80GB of high bandwidth memory (HBM) with bandwidth 1.5-2.0TB/s and 192KB of on-chip SRAM per each of 108 streaming multiprocessors with bandwidth estimated around 19TB/s [@44, 45]. The on-chip SRAM is an order of magnitude faster than HBM but many orders of magnitude smaller in size. As compute has gotten faster relative to memory speed [@61, 62, 63], operations are increasingly bottlenecked by memory (HBM) accesses. Thus exploiting fast SRAM becomes more important.`, "GPU Memory Hierarchy."),
    p(r`GPUs have a massive number of threads to execute an operation (called a kernel). Each kernel loads inputs from HBM to registers and SRAM, computes, then writes outputs to HBM.`, "Execution Model."),
    p(r`Depending on the balance of computation and memory accesses, operations can be classified as either compute-bound or memory-bound. This is commonly measured by the *arithmetic intensity* [@85], which is the number of arithmetic operations per byte of memory access.`, "Performance characteristics."),
    list([
      { text: r`*Compute-bound:* the time taken by the operation is determined by how many arithmetic operations there are, while time accessing HBM is much smaller. Typical examples are matrix multiply with large inner dimension, and convolution with large number of channels.` },
      { text: r`*Memory-bound:* the time taken by the operation is determined by the number of memory accesses, while time spent in computation is much smaller. Examples include most other operations: elementwise (e.g., activation, dropout), and reduction (e.g., sum, softmax, batch norm, layer norm).` },
    ], true),
    p(r`The most common approach to accelerate memory-bound operations is kernel fusion: if there are multiple operations applied to the same input, the input can be loaded once from HBM, instead of multiple times for each operation. Compilers can automatically fuse many elementwise operations [@53, 65, 75]. However, in the context of model training, the intermediate values still need to be written to HBM to save for the backward pass, reducing the effectiveness of naive kernel fusion.`, "Kernel fusion."),

    h(2, "2.2", "Standard Attention Implementation", "sec-2-2"),
    p(r`Given input sequences $\mathbf{Q}, \mathbf{K}, \mathbf{V} \in \mathbb{R}^{N \times d}$ where $N$ is the sequence length and $d$ is the head dimension, we want to compute the attention output $\mathbf{O} \in \mathbb{R}^{N \times d}$:`),
    eq(r`\mathbf{S} = \mathbf{Q}\mathbf{K}^\top \in \mathbb{R}^{N \times N}, \quad \mathbf{P} = \mathrm{softmax}(\mathbf{S}) \in \mathbb{R}^{N \times N}, \quad \mathbf{O} = \mathbf{P}\mathbf{V} \in \mathbb{R}^{N \times d},`, { id: "eq-attn", label: "Standard attention" }),
    p(r`where softmax is applied row-wise.`),
    p(r`Standard attention implementations materialize the matrices $\mathbf{S}$ and $\mathbf{P}$ to HBM, which takes $O(N^2)$ memory. Often $N \gg d$ (e.g., for GPT2, $N = 1024$ and $d = 64$). We describe the standard attention implementation in [#alg0:Algorithm 0]. As some or most of the operations are memory-bound (e.g., softmax), the large number of memory accesses translates to slow wall-clock time.`),
    p(r`This problem is exacerbated by other elementwise operations applied to the attention matrix, such as masking applied to $\mathbf{S}$ or dropout applied to $\mathbf{P}$. As a result, there have been many attempts to fuse several elementwise operations, such as fusing masking with softmax [@77].`),
    p(r`In [#sec-3-2:Section 3.2], we will show that the standard attention implementation performs HBM accesses quadratic in the sequence length $N$. We also compare the number of FLOPs and number of HBM accesses of standard attention and of our method (FlashAttention).`),
    {
      type: "algorithm", id: "alg0", number: "0", title: "Standard Attention Implementation",
      require: [r`Matrices $\mathbf{Q}, \mathbf{K}, \mathbf{V} \in \mathbb{R}^{N \times d}$ in HBM.`],
      lines: [
        L(0, r`Load $\mathbf{Q}, \mathbf{K}$ by blocks from HBM, compute $\mathbf{S} = \mathbf{Q}\mathbf{K}^\top$, write $\mathbf{S}$ to HBM.`),
        L(0, r`Read $\mathbf{S}$ from HBM, compute $\mathbf{P} = \mathrm{softmax}(\mathbf{S})$, write $\mathbf{P}$ to HBM.`),
        L(0, r`Load $\mathbf{P}$ and $\mathbf{V}$ by blocks from HBM, compute $\mathbf{O} = \mathbf{P}\mathbf{V}$, write $\mathbf{O}$ to HBM.`),
        L(0, r`Return $\mathbf{O}$.`),
      ],
    },

    // ── 3 FlashAttention ───────────────────────────────────────────────────
    h(1, "3", "FlashAttention: Algorithm, Analysis, and Extensions", "sec-3"),
    p(r`We show how to compute exact attention with fewer HBM reads/writes and without storing large intermediate matrices for the backward pass. This yields an attention algorithm that is both memory efficient and faster in wall-clock time. We analyze its IO complexity, showing that our method requires much fewer HBM accesses compared to standard attention. We further show that FlashAttention can serve as a useful primitive by extending it to handle block-sparse attention.`),
    p(r`We focus here on the forward pass for ease of exposition; [#app-b:Appendix B] contains details for the backward.`),
    h(2, "3.1", "An Efficient Attention Algorithm With Tiling and Recomputation", "sec-3-1"),
    p(r`Given the inputs $\mathbf{Q}, \mathbf{K}, \mathbf{V} \in \mathbb{R}^{N \times d}$ in HBM, we aim to compute the attention output $\mathbf{O} \in \mathbb{R}^{N \times d}$ and write it to HBM. Our goal is to reduce the amount of HBM accesses (to sub-quadratic in $N$).`),
    p(r`We apply two established techniques (tiling, recomputation) to overcome the technical challenge of computing exact attention in sub-quadratic HBM accesses. We describe this in [#alg1:Algorithm 1]. The main idea is that we split the inputs $\mathbf{Q}, \mathbf{K}, \mathbf{V}$ into blocks, load them from slow HBM to fast SRAM, then compute the attention output with respect to those blocks. By scaling the output of each block by the right normalization factor before adding them up, we get the correct result at the end.`),
    p(r`We compute attention by blocks. Softmax couples columns of $\mathbf{K}$, so we decompose the large softmax with scaling [@51, 60, 66]. For numerical stability, the softmax of vector $x \in \mathbb{R}^B$ is computed as:`, "Tiling."),
    eq(r`m(x) := \max_i \; x_i, \quad f(x) := \begin{bmatrix} e^{x_1 - m(x)} & \dots & e^{x_B - m(x)} \end{bmatrix}, \quad \ell(x) := \sum_i f(x)_i, \quad \mathrm{softmax}(x) := \frac{f(x)}{\ell(x)}.`, { id: "eq-softmax", label: "Numerically stable softmax" }),
    p(r`For vectors $x^{(1)}, x^{(2)} \in \mathbb{R}^B$, we can decompose the softmax of the concatenated $x = \begin{bmatrix} x^{(1)} & x^{(2)} \end{bmatrix} \in \mathbb{R}^{2B}$ as:`),
    eq(r`\begin{aligned}
m(x) &= m\left(\begin{bmatrix} x^{(1)} & x^{(2)} \end{bmatrix}\right) = \max\left(m(x^{(1)}), m(x^{(2)})\right), \quad f(x) = \begin{bmatrix} e^{m(x^{(1)}) - m(x)} f(x^{(1)}) & e^{m(x^{(2)}) - m(x)} f(x^{(2)}) \end{bmatrix}, \\
\ell(x) &= \ell\left(\begin{bmatrix} x^{(1)} & x^{(2)} \end{bmatrix}\right) = e^{m(x^{(1)}) - m(x)} \ell(x^{(1)}) + e^{m(x^{(2)}) - m(x)} \ell(x^{(2)}), \quad \mathrm{softmax}(x) = \frac{f(x)}{\ell(x)}.
\end{aligned}`, { id: "eq-softmax-decomp", label: "Block-wise softmax decomposition" }),
    p(r`Therefore if we keep track of some extra statistics $(m(x), \ell(x))$, we can compute softmax one block at a time.[^2] We thus split the inputs $\mathbf{Q}, \mathbf{K}, \mathbf{V}$ into blocks ([#alg1:Algorithm 1] line 3), compute the softmax values along with extra statistics ([#alg1:Algorithm 1] line 10), and combine the results ([#alg1:Algorithm 1] line 12).`),
    p(r`One of our goals is to not store $O(N^2)$ intermediate values for the backward pass. The backward pass typically requires the matrices $\mathbf{S}, \mathbf{P} \in \mathbb{R}^{N \times N}$ to compute the gradients with respect to $\mathbf{Q}, \mathbf{K}, \mathbf{V}$. However, by storing the output $\mathbf{O}$ and the softmax normalization statistics $(m, \ell)$, we can recompute the attention matrix $\mathbf{S}$ and $\mathbf{P}$ easily in the backward pass from blocks of $\mathbf{Q}, \mathbf{K}, \mathbf{V}$ in SRAM. This can be seen as a form of selective gradient checkpointing [@10, 34]. While gradient checkpointing has been suggested to reduce the maximum amount of memory required [@66], all implementations (that we know off) have to trade speed for memory. In contrast, even with more FLOPs, our recomputation speeds up the backward pass due to reduced HBM accesses ([#fig2:Fig. 2]). The full backward pass description is in [#app-b:Appendix B].`, "Recomputation."),
    p(r`Tiling enables us to implement our algorithm in one CUDA kernel, loading input from HBM, performing all the computation steps (matrix multiply, softmax, optionally masking and dropout, matrix multiply), then write the result back to HBM (masking and dropout in [#app-b:Appendix B]). This avoids repeatedly reading and writing of inputs and outputs from and to HBM.`, "Implementation details: Kernel fusion."),
    {
      type: "algorithm", id: "alg1", number: "1", title: "FlashAttention",
      require: [r`Matrices $\mathbf{Q}, \mathbf{K}, \mathbf{V} \in \mathbb{R}^{N \times d}$ in HBM, on-chip SRAM of size $M$.`],
      lines: [
        L(0, blockSizes),
        L(0, initOLM),
        L(0, divideQKV),
        L(0, divideOLM),
        L(0, forJ),
        L(1, loadKV),
        L(1, forI),
        L(2, loadQOLM),
        L(2, r`On chip, compute $\mathbf{S}_{ij} = \mathbf{Q}_i \mathbf{K}_j^T \in \mathbb{R}^{B_r \times B_c}$.`),
        L(2, r`On chip, compute $\tilde{m}_{ij} = \mathrm{rowmax}(\mathbf{S}_{ij}) \in \mathbb{R}^{B_r}$, $\tilde{\mathbf{P}}_{ij} = \exp(\mathbf{S}_{ij} - \tilde{m}_{ij}) \in \mathbb{R}^{B_r \times B_c}$ (pointwise), $\tilde{\ell}_{ij} = \mathrm{rowsum}(\tilde{\mathbf{P}}_{ij}) \in \mathbb{R}^{B_r}$.`),
        L(2, statsNew),
        L(2, r`Write $\mathbf{O}_i \leftarrow \mathrm{diag}(\ell_i^{\text{new}})^{-1}\left(\mathrm{diag}(\ell_i) e^{m_i - m_i^{\text{new}}} \mathbf{O}_i + e^{\tilde{m}_{ij} - m_i^{\text{new}}} \tilde{\mathbf{P}}_{ij} \mathbf{V}_j\right)$ to HBM.`),
        L(2, writeLM),
        L(1, r`**end for**`),
        L(0, r`**end for**`),
        L(0, r`Return $\mathbf{O}$.`),
      ],
    },
    p(r`We show FlashAttention's correctness, runtime, and memory requirement (proof in [#app-c:Appendix C]).`),
    { type: "theorem", kind: "Theorem", number: "1", id: "thm1", text: r`[#alg1:Algorithm 1] returns $\mathbf{O} = \mathrm{softmax}(\mathbf{Q}\mathbf{K}^\top)\mathbf{V}$ with $O(N^2 d)$ FLOPs and requires $O(N)$ additional memory beyond inputs and output.` },

    h(2, "3.2", "Analysis: IO Complexity of FlashAttention", "sec-3-2"),
    p(r`We analyze the IO complexity of FlashAttention, showing significant reduction in HBM accesses compared to standard attention. We also provide a lower bound, proving that no exact attention algorithm can asymptotically improve on HBM accesses over all SRAM sizes. Proofs are in [#app-c:Appendix C].`),
    {
      type: "figure",
      id: "fig2",
      number: "2",
      panels: [
        {
          kind: "table",
          label: "Left",
          table: {
            id: "fig2-left",
            columns: [
              { key: "metric", label: "Attention", align: "left" },
              { key: "std", label: "Standard", numeric: true },
              { key: "fa", label: "FlashAttention", numeric: true },
            ],
            rows: [
              ["GFLOPs", "66.6", "75.2"],
              ["HBM R/W (GB)", "40.3", "4.4"],
              ["Runtime (ms)", "41.7", "7.3"],
            ],
            chart: {
              kind: "line",
              mode: "rows-as-series",
              normalizeTo: 1,
              xLabel: "Implementation",
              yLabel: "% of standard attention",
              note: "Each metric indexed to standard attention = 100%, so three different units share one axis.",
            },
          },
        },
        { kind: "image", label: "Middle & Right", src: "figures/fig2.png", alt: "Middle: effect of block size — HBM accesses fall from about 6.5 GB at block size 64 to about 1 GB at 512 while forward runtime flattens after 256. Right: block-sparse FlashAttention forward+backward runtime grows linearly with the percentage of non-zero blocks and stays below dense FlashAttention." },
      ],
      caption: r`**Left:** Forward + backward runtime of standard attention and FlashAttention for GPT-2 medium (seq. length 1024, head dim. 64, 16 heads, batch size 64) on A100 GPU. HBM access is the primary factor affecting runtime. **Middle:** Forward runtime of FlashAttention (seq. length 1024, head dim. 64, 16 heads, batch size 64) on A100 GPU. Fewer HBM accesses result in faster runtime, up to a point. **Right:** The runtime (for seq. length 4K) of block-sparse FlashAttention is faster than FlashAttention by a factor proportional to the sparsity.`,
      wide: true,
    },
    { type: "theorem", kind: "Theorem", number: "2", id: "thm2", text: r`Let $N$ be the sequence length, $d$ be the head dimension, and $M$ be size of SRAM with $d \le M \le Nd$. Standard attention ([#alg0:Algorithm 0]) requires $\Theta(Nd + N^2)$ HBM accesses, while FlashAttention ([#alg1:Algorithm 1]) requires $\Theta(N^2 d^2 M^{-1})$ HBM accesses.` },
    p(r`For typical values of $d$ (64-128) and $M$ (around 100KB), $d^2$ is many times smaller than $M$, and thus FlashAttention requires many times fewer HBM accesses than standard implementation. This leads to both faster execution and lower memory footprint, which we validate in [#sec-4-3:Section 4.3].`),
    p(r`The main idea of the proof is that given the SRAM size of $M$, we can load blocks of $\mathbf{K}, \mathbf{V}$ of size $\Theta(M)$ each ([#alg1:Algorithm 1] line 6). For each block of $\mathbf{K}$ and $\mathbf{V}$, we iterate over all blocks of $\mathbf{Q}$ ([#alg1:Algorithm 1] line 8) to compute the intermediate values, resulting in $\Theta(NdM^{-1})$ passes over $\mathbf{Q}$. Each pass loads $\Theta(Nd)$ elements, which amounts to $\Theta(N^2 d^2 M^{-1})$ HBM accesses. We similarly prove that the backward pass of standard attention requires $\Theta(Nd + N^2)$ HBM accesses while the backward pass of FlashAttention requires $\Theta(N^2 d^2 M^{-1})$ HBM accesses ([#app-b:Appendix B]).`),
    p(r`We prove a lower-bound: one cannot asymptotically improve on the number of HBM accesses for all values of $M$ (the SRAM size) when computing exact attention.`),
    { type: "theorem", kind: "Proposition", number: "3", id: "prop3", text: r`Let $N$ be the sequence length, $d$ be the head dimension, and $M$ be size of SRAM with $d \le M \le Nd$. There does not exist an algorithm to compute exact attention with $o(N^2 d^2 M^{-1})$ HBM accesses for all $M$ in the range $[d, Nd]$.` },
    p(r`The proof relies on the fact that for $M = \Theta(Nd)$ any algorithm must perform $\Omega(N^2 d^2 M^{-1}) = \Omega(Nd)$ HBM accesses. This type of lower bound over a subrange of $M$ is common in the streaming algorithms literature [@88]. We leave proving parameterized complexity [@27] lower bounds in terms of $M$ as exciting future work.`),
    p(r`We validate that the number of HBM accesses is the main determining factor of attention run-time. In [#fig2:Fig. 2] (left), we see that even though FlashAttention has higher FLOP count compared to standard attention (due to recomputation in the backward pass), it has much fewer HBM accesses, resulting in much faster runtime. In [#fig2:Fig. 2] (middle), we vary the block size $B_c$ of FlashAttention, which results in different amounts of HBM accesses, and measure the runtime of the forward pass. As block size increases, the number of HBM accesses decreases (as we make fewer passes over the input), and runtime decreases. For large enough block size (beyond 256), the runtime is then bottlenecked by other factors (e.g., arithmetic operations). Moreover, larger block size will not fit into the small SRAM size.`),

    h(2, "3.3", "Extension: Block-Sparse FlashAttention", "sec-3-3"),
    p(r`We extend FlashAttention to approximate attention: we propose block-sparse FlashAttention, whose IO complexity is smaller than FlashAttention by a factor proportional to the sparsity.`),
    p(r`Given inputs $\mathbf{Q}, \mathbf{K}, \mathbf{V} \in \mathbb{R}^{N \times d}$ and a mask matrix $\tilde{\mathbf{M}} \in \{0, 1\}^{N \times N}$, we want to compute:`),
    eq(r`\mathbf{S} = \mathbf{Q}\mathbf{K}^\top \in \mathbb{R}^{N \times N}, \quad \mathbf{P} = \mathrm{softmax}\left(\mathbf{S} \odot \mathbb{1}_{\tilde{\mathbf{M}}}\right) \in \mathbb{R}^{N \times N}, \quad \mathbf{O} = \mathbf{P}\mathbf{V} \in \mathbb{R}^{N \times d},`, { id: "eq-block-sparse", label: "Block-sparse attention" }),
    p(r`where $(\mathbf{S} \odot \mathbb{1}_{\tilde{\mathbf{M}}})_{kl} = \mathbf{S}_{kl}$ if $\tilde{\mathbf{M}}_{kl} = 1$ and $-\infty$ if $\mathbf{M}_{kl} = 0$. We require $\tilde{\mathbf{M}}$ to have block form: for some block sizes $B_r, B_c$, for all $k, l$, $\tilde{\mathbf{M}}_{k,l} = \mathbf{M}_{ij}$ with $i = \lfloor k / B_r \rfloor, j = \lfloor l / B_c \rfloor$ for some $\mathbf{M} \in \{0, 1\}^{N/B_r \times N/B_c}$.`),
    p(r`Given a predefined block sparsity mask $\mathbf{M} \in \{0, 1\}^{N/B_r \times N/B_c}$ we can easily adapt [#alg1:Algorithm 1] to only compute the nonzero blocks of the attention matrix. The algorithm is identical to [#alg1:Algorithm 1], except we skip zero blocks. We reproduce the algorithm description in [#alg5:Algorithm 5] in [#app-b:Appendix B].`),
    p(r`We also analyze the IO complexity of block-sparse FlashAttention.`),
    { type: "theorem", kind: "Proposition", number: "4", id: "prop4", text: r`Let $N$ be the sequence length, $d$ be the head dimension, and $M$ be size of SRAM with $d \le M \le Nd$. Block-sparse FlashAttention ([#alg5:Algorithm 5]) requires $\Theta(Nd + N^2 d^2 M^{-1} s)$ HBM accesses where $s$ is the fraction of nonzero blocks in the block-sparsity mask.` },
    p(r`We see that applying block-sparsity yields a direct improvement by the sparsity to the larger term in the IO complexity. For large sequence lengths $N$, $s$ is often set to $N^{-1/2}$ [@11] or $N^{-1} \log N$ [@3, 17, 92], resulting in $\Theta(N\sqrt{N})$ or $\Theta(N \log N)$ IO complexity. For downstream experiments, we use the fixed butterfly sparsity pattern [@17], which has been shown to be able to approximate arbitrary sparsity [@16].`),
    p(r`In [#fig2:Fig. 2] (right), we validate that as the sparsity increases, the runtime of block-sparse FlashAttention improves proportionally. On the LRA benchmark, block-sparse FlashAttention achieves 2.8× speedup, while performing on par with standard attention ([#sec-4:Section 4]).`),

    // ── 4 Experiments ──────────────────────────────────────────────────────
    h(1, "4", "Experiments", "sec-4"),
    p(r`We evaluate the impact of using FlashAttention to train Transformer models. We validate two claims about training time and model accuracy, and report attention runtime and memory benchmarks.`),
    list([
      { lead: "Training Speed.", text: r`FlashAttention outperforms the MLPerf 1.1 [@58] speed record for BERT by 15%, and speeds up GPT-2 up to 3× over HuggingFace [@87] and 1.8× over Megatron [@77] over standard Transformers. FlashAttention speeds up the long-range arena (LRA) benchmark 2.4×.` },
      { lead: "Quality.", text: r`FlashAttention scales Transformers to longer sequences, yielding higher quality. FlashAttention trains GPT-2 with context length 4K faster than Megatron trains GPT-2 with context length 1K, while achieving 0.7 better perplexity. Modeling longer sequences yields 6.4 points of lift on two long-document classification tasks. Finally, FlashAttention yields the **first Transformer** that can achieve better-than-random performance on the challenging Path-X task (sequence length 16K), and block-sparse FlashAttention yields the **first sequence model** that we know of that can achieve better-than-random performance on Path-256 (sequence length 64K).` },
      { lead: "Benchmarking Attention.", text: r`We measure the runtime and memory performance of FlashAttention and block-sparse FlashAttention based on sequence length. We confirm that the memory footprint of FlashAttention scales linearly with seq. length and is up to 3× faster than standard attention for common seq. lengths (up to 2K). We confirm that runtime of block-sparse FlashAttention scales linearly in seq. length and is faster than all existing approximate attention baselines.` },
    ]),
    p(r`Additional experiment details are in [#app-e:Appendix E].`),

    h(2, "4.1", "Faster Models with FlashAttention", "sec-4-1"),
    p(r`FlashAttention yields the fastest single-node BERT training speed that we know of. We train a BERT-large [@22] model with FlashAttention on Wikipedia. [#tab1:Table 1] compares our training time to the implementation from Nvidia that set the training speed record for MLPerf 1.1 [@58]. Our implementation is 15% faster.`, "BERT."),
    {
      type: "table", id: "tab1", number: "1",
      caption: r`Training time of BERT-large, starting from the same initialization provided by the MLPerf benchmark, to reach the target accuracy of 72.0% on masked language modeling. Averaged over 10 runs on 8×A100 GPUs.`,
      columns: [
        { key: "impl", label: "BERT Implementation", align: "left" },
        { key: "time", label: "Training time (minutes)", numeric: true },
      ],
      rows: [
        ["Nvidia MLPerf 1.1 [@58]", "20.0 ± 1.5"],
        { cells: ["FlashAttention (ours)", "17.4 ± 1.4"], ours: true },
      ],
      chart: { kind: "scatter", mode: "error-dots", value: 1, xLabel: "Implementation", yLabel: "Training time (minutes)", note: "Dots show the mean of 10 runs; whiskers show ± one standard deviation." },
    },
    p(r`FlashAttention yields faster training times for GPT-2 [@67] on the large OpenWebtext dataset [@32] than the widely used HuggingFace [@87] and Megatron-LM [@77] implementations. [#tab2:Table 2] shows up to 3× end-to-end speedup compared to Huggingface and 1.7× speedup compared to Megatron-LM. FlashAttention achieves the same perplexity as the other two implementations, as we do not change the model definition. [#app-e:Appendix E] includes plots of the validation perplexity throughout training, confirming that FlashAttention is as numerically stable as the baselines and produces the same training / validation curves.`, "GPT-2."),
    {
      type: "table", id: "tab2", number: "2",
      caption: r`GPT-2 small and medium using FlashAttention achieve up to 3× speed up compared to Huggingface implementation and up to 1.7× compared to Megatron-LM. Training time reported on 8×A100s GPUs.`,
      columns: [
        { key: "model", label: "Model implementations", align: "left" },
        { key: "ppl", label: "OpenWebText (ppl)", numeric: true },
        { key: "time", label: "Training time (speedup)", numeric: true },
      ],
      rows: [
        ["GPT-2 small - Huggingface [@87]", "18.2", "9.5 days (1.0×)"],
        ["GPT-2 small - Megatron-LM [@77]", "18.2", "4.7 days (2.0×)"],
        { cells: ["GPT-2 small - FlashAttention", "18.2", "2.7 days (3.5×)"], ours: true, bold: [2] },
        { cells: ["GPT-2 medium - Huggingface [@87]", "14.2", "21.0 days (1.0×)"], divider: true },
        ["GPT-2 medium - Megatron-LM [@77]", "14.3", "11.5 days (1.8×)"],
        { cells: ["GPT-2 medium - FlashAttention", "14.3", "6.9 days (3.0×)"], ours: true, bold: [2] },
      ],
      chart: {
        kind: "scatter", mode: "points", x: 2, y: 1,
        xLabel: "Training time (days)", yLabel: "OpenWebText perplexity",
        colorBy: { pattern: "- (\\w[\\w-]*)", legendTitle: "Implementation" },
        shapeBy: { pattern: "GPT-2 (small|medium)" },
        note: "Same perplexity, less time: points further left are faster at equal quality.",
      },
    },
    p(r`We compare vanilla Transformer (with either standard implementation or FlashAttention) on the long-range arena (LRA [@80]) benchmark. We measure accuracy, throughput, and training time of all models. Each task has a different sequence length varying between 1024 and 4096. We follow the implementation and experimental setting in Tay et al. [@80] and Xiong et al. [@90].[^3] [#tab3:Table 3] shows that FlashAttention achieves up 2.4× speed-up compared to standard attention. Block-sparse FlashAttention is faster than all of the approximate attention methods that we have tested.`, "Long-range Arena."),
    {
      type: "table", id: "tab3", number: "3",
      caption: r`The performance of standard attention, FlashAttention, block-sparse FlashAttention, and approximate attention baselines on the Long-Range-Arena benchmarks.`,
      columns: [
        { key: "model", label: "Models", align: "left" },
        { key: "listops", label: "ListOps", numeric: true },
        { key: "text", label: "Text", numeric: true },
        { key: "retrieval", label: "Retrieval", numeric: true },
        { key: "image", label: "Image", numeric: true },
        { key: "path", label: "Pathfinder", numeric: true },
        { key: "avg", label: "Avg", numeric: true },
        { key: "speedup", label: "Speedup", numeric: true },
      ],
      rows: [
        ["Transformer", "36.0", "63.6", "81.6", "42.3", "72.7", "59.3", "-"],
        { cells: ["FlashAttention", "37.6", "63.9", "81.4", "43.5", "72.7", "59.8", "2.4×"], ours: true },
        { cells: ["Block-sparse FlashAttention", "37.0", "63.0", "81.3", "43.6", "73.3", "59.6", "2.8×"], ours: true, bold: [7] },
        { cells: ["Linformer [@84]", "35.6", "55.9", "77.7", "37.8", "67.6", "54.9", "2.5×"], divider: true },
        ["Linear Attention [@50]", "38.8", "63.2", "80.7", "42.6", "72.5", "59.6", "2.3×"],
        ["Performer [@12]", "36.8", "63.6", "82.2", "42.1", "69.9", "58.9", "1.8×"],
        ["Local Attention [@80]", "36.1", "60.2", "76.7", "40.6", "66.6", "56.0", "1.7×"],
        ["Reformer [@51]", "36.5", "63.8", "78.5", "39.6", "69.4", "57.6", "1.3×"],
        ["Smyrf [@19]", "36.1", "64.1", "79.0", "39.6", "70.5", "57.9", "1.7×"],
      ],
      chart: {
        kind: "scatter", mode: "points", x: 7, y: 6,
        fill: { "Transformer": { 7: 1 } },
        xLabel: "Speedup over Transformer (×)", yLabel: "LRA average accuracy (%)",
        colorBy: { rules: [{ match: "FlashAttention", group: "FlashAttention (ours)" }, { match: "^Transformer$", group: "Transformer (1× baseline)" }], fallback: "Approximate attention", legendTitle: "Method" },
        note: "Up and to the right is better. The standard Transformer has no speedup entry, so it sits at the 1× baseline.",
      },
    },

    h(2, "4.2", "Better Models with Longer Sequences", "sec-4-2"),
    p(r`The runtime and memory-efficiency of FlashAttention allow us to increase the context length of GPT-2 by 4× while still running faster than the optimized implementation from Megatron-LM. [#tab4:Table 4] shows that that GPT-2 with FlashAttention and context length 4K is still 30% faster than GPT-2 from Megatron with context length 1K, while achieving 0.7 better perplexity.`, "Language Modeling with Long Context."),
    {
      type: "table", id: "tab4", number: "4",
      caption: r`GPT-2 small with FlashAttention, with 4× larger context length compared to Megatron-LM, is still 30% faster while achieving 0.7 better perplexity. Training time on 8×A100 GPUs is reported.`,
      columns: [
        { key: "model", label: "Model implementations", align: "left" },
        { key: "ctx", label: "Context length", numeric: true },
        { key: "ppl", label: "OpenWebText (ppl)", numeric: true },
        { key: "time", label: "Training time (speedup)", numeric: true },
      ],
      rows: [
        ["GPT-2 small - Megatron-LM", "1k", "18.2", "4.7 days (1.0×)"],
        { cells: ["GPT-2 small - FlashAttention", "1k", "18.2", "2.7 days (1.7×)"], ours: true, bold: [3] },
        { cells: ["GPT-2 small - FlashAttention", "2k", "17.6", "3.0 days (1.6×)"], ours: true },
        { cells: ["GPT-2 small - FlashAttention", "4k", "17.5", "3.6 days (1.3×)"], ours: true, bold: [2] },
      ],
      chart: {
        kind: "line", mode: "columns-as-series", x: 1,
        xLabel: "Context length",
        seriesBy: { pattern: "- (\\w[\\w-]*)" },
        metrics: [
          { col: 2, label: "Perplexity", yLabel: "OpenWebText perplexity (lower is better)" },
          { col: 3, label: "Training time", yLabel: "Training time (days)" },
        ],
        note: "Megatron-LM is only reported at 1k context, so it appears as a single point.",
      },
    },
    p(r`Training Transformers with longer sequences with FlashAttention improves performance on the MIMIC-III [@47] and ECtHR [@6, 7] datasets. MIMIC-III contains intensive care unit patient discharge summaries, each annotated with multiple labels. ECtHR contains legal cases from the European Court of Human Rights, each of which is mapped to articles of the Convention of Human Rights that were allegedly violaged. Both of these datasets contain very long text documents; the average number of tokens in MIMIC is 2,395 tokens, and the longest document contains 14,562 tokens, while the average and longest numbers in ECtHR are 2,197 and 49,392, respectively. We evaluate lift from increasing the sequence length of a pretrained RoBERTa model [@56] (we repeat the positional embeddings, as in Beltagy et al. [@3]).`, "Long Document Classification."),
    p(r`[#tab5:Table 5] shows that sequence length 16K outperforms length 512 by 4.3 points on MIMIC, and that length 8K outperforms length 512 by 8.5 points on ECtHR. The discrepancies may be due to subtle distribution shifts: MIMIC-III contains specialized medical text and thus may be more susceptible to a distribution shift in the document length, whereas ECtHR contains general language.`),
    {
      type: "table", id: "tab5", number: "5",
      caption: r`Long Document performance (micro $F_1$) at different sequence lengths using FlashAttention.`,
      columns: [
        { key: "ds", label: "Dataset", align: "left" },
        { key: "512", label: "512", numeric: true },
        { key: "1024", label: "1024", numeric: true },
        { key: "2048", label: "2048", numeric: true },
        { key: "4096", label: "4096", numeric: true },
        { key: "8192", label: "8192", numeric: true },
        { key: "16384", label: "16384", numeric: true },
      ],
      rows: [
        ["MIMIC-III [@47]", "52.8", "50.7", "51.7", "54.6", "56.4", "57.1"],
        ["ECtHR [@6]", "72.2", "74.3", "77.1", "78.6", "80.7", "79.2"],
      ],
      highlight: { by: "row", best: "max", second: false },
      chart: { kind: "line", mode: "rows-as-series", xLabel: "Sequence length", yLabel: "Micro F1" },
    },
    p(r`The Path-X and Path-256 benchmarks are challenging tasks from the long-range arena benchmark designed to test long context. The task is to classify whether two points in a black and white 128×128 (or 256×256) image have a path connecting them, and the images are fed to the transformer one pixel at a time. In prior work, all transformer models have either run out of memory, or only achieved random performance [@80]. There has been a search for alternative architectures that can model such long context [@37]. We present here the first result of Transformer models being able to solve Path-X and Path-256 ([#tab6:Table 6]). We pretrain a transformer on Path-64, and then transfer to Path-X by spatially interpolating the positional embeddings. FlashAttention achieves 61.4 accuracy on Path-X. Additionally, block-sparse FlashAttention enables the Transformers to scale to sequence length 64K, achieving 63.1 accuracy[^4] on Path-256.`, "Path-X and Path-256."),
    {
      type: "table", id: "tab6", number: "6",
      caption: r`We report the first Transformer model that can achieve non-random performance on Path-X and Path-256.`,
      columns: [
        { key: "model", label: "Model", align: "left" },
        { key: "px", label: "Path-X", numeric: true },
        { key: "p256", label: "Path-256", numeric: true },
      ],
      rows: [
        ["Transformer", "✗", "✗"],
        ["Linformer [@84]", "✗", "✗"],
        ["Linear Attention [@50]", "✗", "✗"],
        ["Performer [@12]", "✗", "✗"],
        ["Local Attention [@80]", "✗", "✗"],
        ["Reformer [@51]", "✗", "✗"],
        ["SMYRF [@19]", "✗", "✗"],
        { cells: ["FlashAttention", "61.4", "✗"], ours: true, divider: true },
        { cells: ["Block-sparse FlashAttention", "56.0", "63.1"], ours: true },
      ],
      highlight: { by: "column", best: "max", second: false },
      legend: "✗ — ran out of memory or did not beat random chance.",
      chart: {
        kind: "scatter", mode: "rows-as-series", xLabel: "Task", yLabel: "Accuracy (%)",
        referenceLine: { value: 50, label: "Chance (50%)" },
        note: "Only reported accuracies are plotted; the seven baselines marked ✗ have no score to show.",
      },
    },

    h(2, "4.3", "Benchmarking Attention", "sec-4-3"),
    p(r`We vary sequence length and measure runtime and memory usage of FlashAttention and block-sparse FlashAttention against various attention baselines on one A100 GPU with 40 GB HBM, with dropout and a padding mask. We compare against reference implementations for exact attention, approximate attention, and sparse attention. We report a subset of baselines in the main body; [#app-e:Appendix E] contains more baselines and full details.`),
    {
      type: "figure", id: "fig3", number: "3",
      images: [{ src: "figures/fig3.png", alt: "Left: log-scale runtime of forward+backward pass versus sequence length 128–8192 for FlashAttention, block-sparse FlashAttention, PyTorch, Megatron, Linformer and OpenAI sparse attention, with crossover points marked. Right: memory footprint versus sequence length up to 64K; FlashAttention is 20× below PyTorch and 2× below Linformer." }],
      caption: r`**Left:** runtime of forward pass + backward pass. **Right:** attention memory usage.`,
      wide: true,
    },
    p(r`[#fig3:Figure 3] (left) reports the runtime in milliseconds of the forward + backward pass of FlashAttention and block-sparse FlashAttention compared to the baselines in exact, approximate, and sparse attention (exact numbers in [#app-e:Appendix E]). Runtime grows quadratically with sequence length, but FlashAttention runs significantly faster than **exact attention** baselines, up to 3× faster than the PyTorch implementation. The runtimes of many approximate/sparse attention mechanisms grow linearly with sequence length, but FlashAttention still runs faster than approximate and sparse attention for short sequences due to fewer memory accesses. The **approximate attention** runtimes begin to cross over with FlashAttention at sequences between 512 and 1024. On the other hand, block-sparse FlashAttention is faster than all implementations of exact, sparse, and approximate attention that we know of, across all sequence lengths.`, "Runtime."),
    p(r`[#fig3:Figure 3] (right) shows the memory footprint of FlashAttention and block-sparse FlashAttention compared to various exact, approximate, and sparse attention baselines. FlashAttention and block-sparse FlashAttention have the same memory footprint, which grows linearly with sequence length. FlashAttention is up to 20× more memory efficient than **exact attention** baselines, and is more memory-efficient than the **approximate attention** baselines. All other algorithms except for Linformer run out of memory on an A100 GPU before 64K, and FlashAttention is still 2× more efficient than Linformer.`, "Memory Footprint."),

    // ── 5 Limitations ──────────────────────────────────────────────────────
    h(1, "5", "Limitations and Future Directions", "sec-5"),
    p(r`We discuss limitations of our approach and future directions. Related work is given in [#app-a:Appendix A].`),
    p(r`Our current approach to building IO-aware implementations of attention requires writing a new CUDA kernel for each new attention implementation. This requires writing the attention algorithm in a considerably lower-level language than PyTorch, and requires significant engineering effort. Implementations may also not be transferrable across GPU architectures. These limitations suggest the need for a method that supports writing attention algorithms in a high-level language (e.g., PyTorch), and compiling to IO-aware implementations in CUDA—similar to efforts such as Halide in image processing [@70].`, "Compiling to CUDA."),
    p(r`We believe that the IO-aware approach can extend beyond attention. Attention is the most memory-intensive computation in Transformers, but every layer in a deep network touches GPU HBM. We hope our work inspires IO-aware implementations of additional modules. We discuss these potential extensions in [#app-d:Appendix D].`, "IO-Aware Deep Learning."),
    p(r`Our IO-aware implementation of attention is optimal within constants for computing attention on a single GPU. However, the attention computation may be parallelizable across multiple GPUs [@72]. Using multiple GPUs adds an additional layer to IO analysis—accounting for data transfer between GPUs. We hope our work inspires future work in this direction.`, "Multi-GPU IO-Aware Methods."),

    // ── Acknowledgments ────────────────────────────────────────────────────
    h(1, "", "Acknowledgments", "ack"),
    p(r`Our implementation uses Apex's FMHA code ([github.com/NVIDIA/apex/…/fmha](https://github.com/NVIDIA/apex/tree/master/apex/contrib/csrc/fmha)) as a starting point. We thank Young-Jun Ko for the in-depth explanation of his FMHA implementation and for his thoughtful answers to our questions about CUDA. We thank Sabri Eyuboglu, Megan Leszczynski, Laurel Orr, Yuhuai Wu, Beidi Chen, and Xun Huang for their constructive feedback and suggestions on early drafts of the paper. We thank Markus Rabe and Charles Staats for helpful discussion of their attention algorithm.`),
    p(r`We gratefully acknowledge the support of NIH under No. U54EB020405 (Mobilize), NSF under Nos. CCF1763315 (Beyond Sparsity), CCF1563078 (Volume to Velocity), and 1937301 (RTML); ARL under No. W911NF-21-2-0251 (Interactive Human-AI Teaming); ONR under No. N000141712266 (Unifying Weak Supervision); ONR N00014-20-1-2480: Understanding and Applying Non-Euclidean Geometry in Machine Learning; N000142012275 (NEPTUNE); NXP, Xilinx, LETI-CEA, Intel, IBM, Microsoft, NEC, Toshiba, TSMC, ARM, Hitachi, BASF, Accenture, Ericsson, Qualcomm, Analog Devices, Google Cloud, Salesforce, Total, the HAI-GCP & HAI-Azure Cloud Credits for Research program, the Stanford Data Science Initiative (SDSI), Department of Defense (DoD) through the National Defense Science and Engineering Graduate Fellowship (NDSEG) Program, and members of the Stanford DAWN project: Facebook, Google, and VMWare. The U.S. Government is authorized to reproduce and distribute reprints for Governmental purposes notwithstanding any copyright notation thereon. Any opinions, findings, and conclusions or recommendations expressed in this material are those of the authors and do not necessarily reflect the views, policies, or endorsements, either expressed or implied, of NIH, ONR, or the U.S. Government. Atri Rudra's research is supported by NSF grant CCF-1763481.`),
    { type: "marker", kind: "references-original-position", note: "In the source PDF the bibliography appears here, between the acknowledgments and the appendices. It has been moved to the end of the document." },

    // ── Appendix A ─────────────────────────────────────────────────────────
    { type: "appendix-start" },
    h(1, "A", "Related Work", "app-a"),
    p(r`The broad concept of optimizing for reading and writing to fast/slow memory has a long history in computer science and has been known by many names. We draw the most direct connection to the literature of analyzing I/O complexity in this work [@1], but concepts of memory hierarchies are fundamental and has appeared in many forms, from the working set model [@21], to data locality [@86], to the Roofline model of arithmetic intensity [@85], to analyses of scalability [@59], to standard textbook treatments of computer architecture [@40]. We hope that this work encourages the community to adopt these ideas in more parts of the deep learning stack.`, "IO-Aware Runtime Optimization."),
    p(r`Matrix multiply is the core computational bottleneck of most machine learning models. To reduce the computational complexity, there have been numerous approaches to learn over a more efficient set of matrices. These matrices are called *structured matrices*, which have subquadratic ($o(n^2)$ for dimension $n \times n$) number of parameters and runtime. Most common examples of structured matrices are sparse and low-rank matrices, along with fast transforms commonly encountered in signal processing (Fourier, Chebyshev, sine/cosine, orthogonal polynomials). There have been several more general classes of structured matrices proposed in machine learning: Toeplitz-like [@78], low-displacement rank [@49], quasi-separable [@25]). The butterfly pattern we use for our block-sparse attention is motivated by the fact that butterfly matrices [@15, 64] and their products have been shown to be able to express any structured matrices with almost optimal runtime and number of parameters [@16, 20]. However, even though structured matrices are efficient in theory, they have not seen wide adoption since it is hard to translate their efficiency to wall-clock speedup since dense unconstrained matrix multiply has very optimize implementation, a phenomenon known as the hardware lottery [@41]. Extensions of butterfly matrices [@17, 18] aimed to make butterfly matrices more hardware-friendly.`, "Efficient ML Models with Structured Matrices."),
    p(r`Our block-sparse FlashAttention can be seen as a step towards making sparse model training more efficient. Sparse models have seen success in compressing models for inference (pruning) by sparsifying the weight matrices [@23, 38, 39, 55, 76]. For model training, the lottery tickets hypothesis [@28, 29, 30] suggests that there are a set of small sub-networks derived from a larger dense network that performs as well as the original dense network. Out block-sparse FlashAttention can also be seen as a fixed lottery ticket in the context of attention: we fix the sparsity pattern to be the butterfly pattern through training, and observe that it performs almost as well as the (dense) FlashAttention on the Long-range Arena tasks.`, "Sparse Training."),
    p(r`Transformer-based models have become the most widely-used architecture in natural language processing [@22] and computer vision [@24, 91]. However, one of their computational bottlenecks is that their time and memory scales quadratic in the sequence length. There are numerous approaches to overcome this bottleneck, including approximation with hashing (i.e., sparse) such as Reformer [@51] and Smyrf [@19] and with low-rank approximation such as Performer [@12, 54]. One can even combine sparse and low-rank approximation for better accuracy (e.g., Longformer [@3], BigBird [@92], Scatterbrain [@9], Long-short transformer [@94], Combiner [@73]). Other approaches include compressing along the sequence dimension to attend to multiple tokens at once [@52, 57, 79, 89]. One can also attend over the states from previous sequences to help lengthen the context (e.g., Transformer-XL [@14] and Compressive Transformer [@69]). We recommend the survey [@81] for more details.`, "Efficient Transformer."),
    p(r`There are several lines of work on developing other modules instead of attention to model longer context. HiPPO [@35] and its extensions, most notably S4 [@31, 36, 37] projects the history on a polynomial basis, allowing accurate reconstruction of the history through state-space models. They combine the strengths of CNNs (efficient training), RNNs (efficient inference), and continuous models (robust to change in sampling rates). LambdaNetworks [@2], AFT [@93] and FLASH [@42] are other attempts at replacing attention in the context of image classification and language modeling.`),

    // ── Appendix B ─────────────────────────────────────────────────────────
    h(1, "B", "Algorithm Details", "app-b"),
    p(r`We first derive the forward and backward passes of attention and show that they can be computed in a memory-efficient manner (requiring extra memory linear instead of quadratic in the sequence length). Though they reduce the amount of extra memory required, naively they still incur quadratic HBM accesses, resulting in slower execution speed. We describe the FlashAttention algorithm to implement both the forward and the backward passes on GPUs that reduces HBM accesses, leading to both faster runtime and smaller memory footprint.`),
    h(2, "B.1", "Memory-efficient forward pass", "app-b-1"),
    p(r`The main challenge in making attention memory-efficient is the softmax that couples the columns of $\mathbf{K}$ (and columns of $\mathbf{V}$). Our approach is to compute the softmax normalization constant separately to decouple the columns. This technique [@60] has been used in the literature [@51, 66] to show that attention computation does not need quadratic *extra* memory (though the number of HBM accesses is still quadratic, resulting in slow run-time).`),
    p(r`For simplicity, we omit here the max-shifting step during softmax. The full algorithm in [#app-b-3:Appendix B.3] contains all the steps.`),
    p(r`Recall that given input sequences $\mathbf{Q}, \mathbf{K}, \mathbf{V} \in \mathbb{R}^{N \times d}$, we want to compute the attention output $\mathbf{O} \in \mathbb{R}^{N \times d}$:`),
    eq(r`\mathbf{S} = \mathbf{Q}\mathbf{K}^\top \in \mathbb{R}^{N \times N}, \quad \mathbf{P} = \mathrm{softmax}(\mathbf{S}) \in \mathbb{R}^{N \times N}, \quad \mathbf{O} = \mathbf{P}\mathbf{V} \in \mathbb{R}^{N \times d}.`),
    p(r`We have that $S_{ij} = q_i^T k_j$ where $q_i$ and $k_j$ are the $i$-th and $j$-th columns of $\mathbf{Q}$ and $\mathbf{K}$ respectively. Define the normalization constants of softmax:`),
    eq(r`L_i = \sum_j e^{q_i^T k_j}.`, { id: "eq1", number: "1", label: "Softmax normalizer" }),
    p(r`Let $v_j$ be the $j$-th column of $\mathbf{V}$, then the $i$-th columns of the output is`),
    eq(r`o_i = P_{i:} \mathbf{V} = \sum_j P_{ij} v_j = \sum_j \frac{e^{q_i^T k_j}}{L_i} v_j.`, { id: "eq2", number: "2", label: "Output column" }),
    p(r`We see that once $L_i$ is computed, we can compute $o_i$ without extra memory by repeatedly summing $\frac{e^{q_i^T k_j}}{L_i} v_j$. Therefore the forward pass can be computed with $O(n)$ extra memory:`),
    list([
      { text: r`Compute $L_i$ for all $i$ according to [#eq1:Eq. (1)], which takes $O(n)$ extra memory.` },
      { text: r`Compute $o_i$ for all $i$ according to [#eq2:Eq. (2)], which takes $O(d)$ extra memory.` },
    ], true),
    h(2, "B.2", "Memory-efficient backward pass", "app-b-2"),
    p(r`We derive the backward pass of attention and show that it can also be computed with linear memory. Rabe and Staats [@66] suggests that the backward pass can be done without quadratic extra memory by applying gradient checkpointing to the memory-efficient forward pass. We instead derive the backward pass explicitly and show how it can be computed in a memory-efficient manner.`),
    p(r`Suppose that there is a scalar loss function $\phi$, and let the output gradient be $\mathbf{dO} \in \mathbb{R}^{n \times d}$ (where $\mathbf{dO}$ denotes $\frac{\partial \phi}{\partial \mathbf{O}}$). We want to compute the input gradients $\mathbf{dQ}, \mathbf{dK}, \mathbf{dV} \in \mathbb{R}^{n \times d}$ (where $\mathbf{dQ}, \mathbf{dK}, \mathbf{dV}$ denote $\frac{\partial \phi}{\partial \mathbf{Q}}, \frac{\partial \phi}{\partial \mathbf{K}}, \frac{\partial \phi}{\partial \mathbf{V}}$ respectively).`),
    p(r`The gradient $\mathbf{dV}$ is easy to see. Applying reverse-mode autodiff by hand (aka the chain rule), we obtain (in matrix notation) $\mathbf{dV} = \mathbf{P}^T \mathbf{dO}$. Thus:`),
    eq(r`dv_j = \sum_i P_{ij} \, do_i = \sum_i \frac{e^{q_i^T k_j}}{L_i} do_i.`, { id: "eq3", number: "3", label: "Gradient of V" }),
    p(r`Since we already computed $L_i$, $dv_j$ can be computed without extra memory by repeated summing.`),
    p(r`The gradients $\mathbf{dQ}$ and $\mathbf{dK}$ are a little more complicated. We go through the gradients $\mathbf{dP}$ and $\mathbf{dS}$ first. From [#eq2:Eq. (2)], we have that $\mathbf{dP} = \mathbf{dO}\mathbf{V}^T$, and so:`),
    eq(r`dP_{ij} = do_i^T v_j.`),
    p(r`Recall that $P_{i:} = \mathrm{softmax}(S_{i:})$. Using the fact that the Jacobian of $y = \mathrm{softmax}(x)$ is $\mathrm{diag}(y) - yy^T$, we have that`),
    eq(r`dS_{i:} = \left(\mathrm{diag}(P_{i:}) - P_{i:} P_{i:}^T\right) dP_{i:} = P_{i:} \circ dP_{i:} - \left(P_{i:}^T dP_{i:}\right) P_{i:},`),
    p(r`where $\circ$ denotes pointwise multiplication. Define`),
    eq(r`D_i = P_{i:}^T dP_{i:} = \sum_j \frac{e^{q_i^T k_j}}{L_i} do_i^T v_j = do_i^T \sum_j \frac{e^{q_i^\top k_j}}{L_i} v_j = do_i^T o_i,`, { id: "eq4", number: "4", label: "Row-wise dot product D" }),
    p(r`then`),
    eq(r`dS_{i:} = P_{i:} \circ dP_{i:} - D_i P_{i:}.`),
    p(r`Hence`),
    eq(r`dS_{ij} = P_{ij} dP_{ij} - D_i P_{ij} = P_{ij} (dP_{ij} - D_i).`),
    p(r`Now we can get the gradients $\mathbf{dQ}$ and $\mathbf{dK}$. Recall that $S_{ij} = q_i^T k_j$, so`),
    eq(r`dq_i = \sum_j dS_{ij} k_j = \sum_j P_{ij} (dP_{ij} - D_i) k_j = \sum_j \frac{e^{q_i^T k_j}}{L_i} \left(do_i^T v_j - D_i\right) k_j.`, { id: "eq5", number: "5", label: "Gradient of Q" }),
    p(r`Similarly,`),
    eq(r`dk_j = \sum_i dS_{ij} q_i = \sum_i P_{ij} (dP_{ij} - D_i) q_i = \sum_i \frac{e^{q_i^T k_j}}{L_i} \left(do_i^T v_j - D_i\right) q_i.`, { id: "eq6", number: "6", label: "Gradient of K" }),
    p(r`Therefore the backward pass can also be computed with $O(n)$ extra memory:`),
    list([
      { text: r`Compute $dv_j$ for all $j$ according to [#eq3:Eq. (3)], which takes $O(d)$ extra memory.` },
      { text: r`Compute $D_i$ for all $i$ according to [#eq4:Eq. (4)], which takes $O(n)$ extra memory.` },
      { text: r`Compute $dq_i$ for all $i$ according to [#eq5:Eq. (5)], which takes $O(d)$ extra memory.` },
      { text: r`Compute $dk_j$ for all $j$ according to [#eq6:Eq. (6)], which takes $O(d)$ extra memory.` },
    ], true),

    h(2, "B.3", "FlashAttention: Forward Pass", "app-b-3"),
    p(r`We describe the full details of FlashAttention forward pass. Given input sequences $\mathbf{Q}, \mathbf{K}, \mathbf{V} \in \mathbb{R}^{N \times d}$, we want to compute the attention output $\mathbf{O} \in \mathbb{R}^{N \times d}$:`),
    eq(r`\begin{aligned}
&\mathbf{S} = \tau \mathbf{Q}\mathbf{K}^\top \in \mathbb{R}^{N \times N}, \quad \mathbf{S}^{\text{masked}} = \operatorname{MASK}(S) \in \mathbb{R}^{N \times N}, \quad \mathbf{P} = \mathrm{softmax}(\mathbf{S}^{\text{masked}}) \in \mathbb{R}^{N \times N}, \\
&\mathbf{P}^{\text{dropped}} = \mathrm{dropout}(\mathbf{P}, p_{\text{drop}}), \quad \mathbf{O} = \mathbf{P}^{\text{dropped}} \mathbf{V} \in \mathbb{R}^{N \times d},
\end{aligned}`, { id: "eq-full-fwd", label: "Attention with scaling, masking and dropout" }),
    p(r`where $\tau \in \mathbb{R}$ is some softmax scaling (typically $\frac{1}{\sqrt{d}}$), $\operatorname{MASK}$ is some masking function that sets some entries of the input to $-\infty$ and keep other entries the same (e.g., key padding mask when sequences in the batch don't have the same lengths and are padded), and $\mathrm{dropout}(x, p)$ applies dropout to $x$ elementwise (i.e., output $\frac{x}{1-p}$ with probability $1 - p$ and output 0 with probability $p$ for each element $x$).`),
    p(r`The full algorithm is in [#alg2:Algorithm 2]. We save the output $\mathbf{O}$, the softmax statistics $\ell$ and $m$, and the pseudo-random number generator state $\mathcal{R}$ for the backward pass.`),
    {
      type: "algorithm", id: "alg2", number: "2", title: "FlashAttention Forward Pass",
      require: [r`Matrices $\mathbf{Q}, \mathbf{K}, \mathbf{V} \in \mathbb{R}^{N \times d}$ in HBM, on-chip SRAM of size $M$, softmax scaling constant $\tau \in \mathbb{R}$, masking function $\operatorname{MASK}$, dropout probability $p_{\text{drop}}$.`],
      lines: [
        L(0, r`Initialize the pseudo-random number generator state $\mathcal{R}$ and save to HBM.`),
        L(0, blockSizes),
        L(0, initOLM),
        L(0, divideQKV),
        L(0, divideOLM),
        L(0, forJ),
        L(1, loadKV),
        L(1, forI),
        L(2, loadQOLM),
        ...maskedFwdBody(2),
        L(1, r`**end for**`),
        L(0, r`**end for**`),
        L(0, r`Return $\mathbf{O}, \ell, m, \mathcal{R}$.`),
      ],
    },

    h(2, "B.4", "FlashAttention: Backward Pass", "app-b-4"),
    p(r`We describe the full details of FlashAttention backward pass. Given input sequences $\mathbf{Q}, \mathbf{K}, \mathbf{V} \in \mathbb{R}^{N \times d}$, the output $\mathbf{O} \in \mathbb{R}^{N \times d}$, and the output gradient $\mathbf{dO}$, we want to compute the input gradients $\mathbf{dQ}, \mathbf{dK}, \mathbf{dV} \in \mathbb{R}^{N \times d}$.`),
    p(r`We first describe the standard attention backward pass in [#alg3:Algorithm 3] for completeness.`),
    {
      type: "algorithm", id: "alg3", number: "3", title: "Standard Attention Backward Pass",
      require: [r`Matrices $\mathbf{Q}, \mathbf{K}, \mathbf{V}, \mathbf{dO} \in \mathbb{R}^{N \times d}$, $\mathbf{P} \in \mathbb{R}^{N \times N}$ in HBM.`],
      lines: [
        L(0, r`Load $\mathbf{P}, \mathbf{dO}$ by blocks from HBM, compute $\mathbf{dV} = \mathbf{P}^\top \mathbf{dO} \in \mathbb{R}^{N \times d}$, write $\mathbf{dV}$ to HBM.`),
        L(0, r`Load $\mathbf{dO}, \mathbf{V}$ by blocks from HBM, compute $\mathbf{dP} = \mathbf{dO}\mathbf{V}^\top \in \mathbb{R}^{N \times N}$, write $\mathbf{dP}$ to HBM.`),
        L(0, r`Read $\mathbf{P}, \mathbf{dP}$ from HBM, compute $\mathbf{dS} \in \mathbb{R}^{N \times N}$ where $dS_{ij} = P_{ij}\left(dP_{ij} - \sum_l P_{il} dP_{il}\right)$, write $\mathbf{dS}$ to HBM.`),
        L(0, r`Load $\mathbf{dS}$ and $\mathbf{K}$ by blocks from HBM, compute $\mathbf{dQ} = \mathbf{dS}\mathbf{K}$, write $\mathbf{dQ}$ to HBM.`),
        L(0, r`Load $\mathbf{dS}$ and $\mathbf{Q}$ by blocks from HBM, compute $\mathbf{dK} = \mathbf{dS}^\top \mathbf{Q}$, write $\mathbf{dK}$ to HBM.`),
        L(0, r`Return $\mathbf{dQ}, \mathbf{dK}, \mathbf{dV}$.`),
      ],
    },
    p(r`We now make two observations about FlashAttention backward pass:`),
    list([
      { text: r`We do not need to store the dropout mask of size $O(N^2)$ from the forward pass. Instead, we can save the pseudo-random number generator states from the forward pass and re-generate the dropout mask in the backward pass. This allows us to only use $O(N)$ extra memory.` },
      { text: r`When computing the softmax gradient, we use [#eq4:Eq. (4)] to compute $D_i = P_{i:}^\top dP_{i:}$ without reducing over $P_{i:}$ and $dP_{i:}$ of size $N$ (they might not fit into SRAM). Instead we can rewrite $D_i = do_i^\top o_i$ and compute the dot product between vectors of size $d$.` },
    ], true),
    p(r`The full FlashAttention backward pass algorithm is in [#alg4:Algorithm 4]. Conceptually it is just a block version of the derivation in [#app-b-2:Appendix B.2].`),
    {
      type: "algorithm", id: "alg4", number: "4", title: "FlashAttention Backward Pass",
      require: [r`Matrices $\mathbf{Q}, \mathbf{K}, \mathbf{V}, \mathbf{O}, \mathbf{dO} \in \mathbb{R}^{N \times d}$ in HBM, vectors $\ell, m \in \mathbb{R}^N$ in HBM, on-chip SRAM of size $M$, softmax scaling constant $\tau \in \mathbb{R}$, masking function $\operatorname{MASK}$, dropout probability $p_{\text{drop}}$, pseudo-random number generator state $\mathcal{R}$ from the forward pass.`],
      lines: [
        L(0, r`Set the pseudo-random number generator state to $\mathcal{R}$.`),
        L(0, blockSizes),
        L(0, divideQKV),
        L(0, r`Divide $\mathbf{O}$ into $T_r$ blocks $\mathbf{O}_i, \dots, \mathbf{O}_{T_r}$ of size $B_r \times d$ each, divide $\mathbf{dO}$ into $T_r$ blocks $\mathbf{dO}_i, \dots, \mathbf{dO}_{T_r}$ of size $B_r \times d$ each, divide $\ell$ into $T_r$ blocks $\ell_i, \dots, \ell_{T_r}$ of size $B_r$ each, divide $m$ into $T_r$ blocks $m_1, \dots, m_{T_r}$ of size $B_r$ each.`),
        L(0, r`Initialize $\mathbf{dQ} = (0)_{N \times d}$ in HBM and divide it into $T_r$ blocks $\mathbf{dQ}_1, \dots, \mathbf{dQ}_{T_r}$ of size $B_r \times d$ each. Initialize $\mathbf{dK} = (0)_{N \times d}, \mathbf{dV} = (0)_{N \times d}$ in HBM and divide $\mathbf{dK}, \mathbf{dV}$ in to $T_c$ blocks $\mathbf{dK}_1, \dots, \mathbf{dK}_{T_c}$ and $\mathbf{dV}_1, \dots, \mathbf{dV}_{T_c}$, of size $B_c \times d$ each.`),
        L(0, forJ),
        L(1, loadKV),
        L(1, r`Initialize $\tilde{\mathbf{dK}}_j = (0)_{B_c \times d}, \tilde{\mathbf{dV}}_j = (0)_{B_c \times d}$ on SRAM.`),
        L(1, forI),
        L(2, r`Load $\mathbf{Q}_i, \mathbf{O}_i, \mathbf{dO}_i, \mathbf{dQ}_i, \ell_i, m_i$ from HBM to on-chip SRAM.`),
        L(2, r`On chip, compute $\mathbf{S}_{ij} = \tau \mathbf{Q}_i \mathbf{K}_j^T \in \mathbb{R}^{B_r \times B_c}$.`),
        L(2, r`On chip, compute $\mathbf{S}_{ij}^{\text{masked}} = \operatorname{MASK}(\mathbf{S}_{ij})$.`),
        L(2, r`On chip, compute $\mathbf{P}_{ij} = \mathrm{diag}(l_i)^{-1} \exp(\mathbf{S}_{ij}^{\text{masked}} - m_i) \in \mathbb{R}^{B_r \times B_c}$.`),
        L(2, r`On chip, compute dropout mask $\mathbf{Z}_{ij} \in \mathbb{R}^{B_r \times B_c}$ where each entry has value $\frac{1}{1 - p_{\text{drop}}}$ with probability $1 - p_{\text{drop}}$ and value 0 with probability $p_{\text{drop}}$.`),
        L(2, r`On chip, compute $\mathbf{P}_{ij}^{\text{dropped}} = \mathbf{P}_{ij} \circ \mathbf{Z}_{ij}$ (pointwise multiply).`),
        L(2, r`On chip, compute $\tilde{\mathbf{dV}}_j \leftarrow \tilde{\mathbf{dV}}_j + (\mathbf{P}_{ij}^{\text{dropped}})^\top \mathbf{dO}_i \in \mathbb{R}^{B_c \times d}$.`),
        L(2, r`On chip, compute $\mathbf{dP}_{ij}^{\text{dropped}} = \mathbf{dO}_i \mathbf{V}_j^\top \in \mathbb{R}^{B_r \times B_c}$.`),
        L(2, r`On chip, compute $\mathbf{dP}_{ij} = \mathbf{dP}_{ij}^{\text{dropped}} \circ \mathbf{Z}_{ij}$ (pointwise multiply).`),
        L(2, r`On chip, compute $D_i = \mathrm{rowsum}(\mathbf{dO}_i \circ \mathbf{O}_i) \in \mathbb{R}^{B_r}$.`),
        L(2, r`On chip, compute $\mathbf{dS}_{ij} = \mathbf{P}_{ij} \circ (\mathbf{dP}_{ij} - D_i) \in \mathbb{R}^{B_r \times B_c}$.`),
        L(2, r`Write $\mathbf{dQ}_i \leftarrow \mathbf{dQ}_i + \tau \mathbf{dS}_{ij} \mathbf{K}_j \in \mathbb{R}^{B_r \times d}$ to HBM.`),
        L(2, r`On chip, compute $\tilde{\mathbf{dK}}_j \leftarrow \tilde{\mathbf{dK}}_j + \tau \mathbf{dS}_{ij}^\top \mathbf{Q}_i \in \mathbb{R}^{B_c \times d}$.`),
        L(1, r`**end for**`),
        L(1, r`Write $\mathbf{dK}_j \leftarrow \tilde{\mathbf{dK}}_j, \mathbf{dV}_j \leftarrow \tilde{\mathbf{dV}}_j$ to HBM.`),
        L(0, r`**end for**`),
        L(0, r`Return $\mathbf{dQ}, \mathbf{dK}, \mathbf{dV}$.`),
      ],
    },
    p(r`We see that similar to the forward pass, the backward pass performs $O(N^2)$ FLOPs and only requires $O(N)$ extra memory beyond inputs, output, output gradient, and input gradients.`),
    p(r`We analyze the IO-complexity of the backward pass, similar to the forward pass ([#thm2:Theorem 2]).`),
    { type: "theorem", kind: "Theorem", number: "5", id: "thm5", text: r`Let $N$ be the sequence length, $d$ be the head dimension, and $M$ be size of SRAM with $d \le M \le Nd$. Standard attention ([#alg0:Algorithm 0]) backward pass requires $\Theta(Nd + N^2)$ HBM accesses, while FlashAttention backward pass ([#alg4:Algorithm 4]) requires $\Theta(N^2 d^2 M^{-1})$ HBM accesses.` },
    p(r`The proof is in [#app-c:Appendix C].`),

    h(2, "B.5", "Comparison with Rabe and Staats [66]", "app-b-5"),
    p(r`We describe here some similarities and differences between our FlashAttention algorithm and the algorithm of Rabe and Staats [@66].`),
    p(r`Conceptually, both FlashAttention and Rabe and Staats [@66] operate on blocks of the attention matrix using the well-established technique of tiling (or softmax scaling) [@51, 60]. To reduce the memory footprint, both methods avoid storing the large attention matrix in the forward pass and recompute it in the backward pass.`),
    p(r`The first major difference is that Rabe and Staats [@66] focuses on the reducing the total memory footprint (maximum amount of GPU memory required) while FlashAttention focuses on reducing memory accesses (the number of memory reads/writes). As mentioned in [#sec-2:Section 2], the amount of memory access is the primary determining factor of runtime. Reducing memory accesses also necessarily reduces the total amount of memory required (e.g., if an operation incurs $A$ memory accesses, then its total memory requirement is at most $A$). As a result, FlashAttention is faster than standard attention (2-4×) while Rabe and Staats [@66] is around the same speed or slightly slower than standard attention. In terms of total memory required, both methods offer substantial memory saving.`),
    p(r`The second difference between the two methods is the way information is summarized from each block to pass to the next block. Rabe and Staats [@66] summarizes each block with its temporary output along with the softmax normalization statistics. At the end of the forward pass, the temporary outputs of all the blocks are combined using the statistics to produce the final output. FlashAttention instead incrementally updates the output ([#alg1:Algorithm 1] line 12) after processing each block, so only one copy of the output is needed (instead of $K$ copies for $K$ blocks). This means that FlashAttention has smaller total memory requirement compared to Rabe and Staats [@66].`),
    p(r`The final major difference is the way the backward pass is computed. Rabe and Staats [@66] uses gradient checkpointing to recompute the attention matrix and the temporary output of each block. FlashAttention instead simplifies the backward pass analytically (Appendices [#app-b-2:B.2] and [#app-b-4:B.4]). It only recomputes the attention matrix and does not recompute the temporary output of each block. This reduces the memory requirement for the backward pass and yields speedup.`),

    // ── Appendix C ─────────────────────────────────────────────────────────
    h(1, "C", "Proofs", "app-c"),
    {
      type: "proof", of: "Theorem 1", target: "thm1", id: "proof-thm1",
      blocks: [
        p(r`We first count the number of FLOPs and extra memory required.`),
        p(r`The dominating FLOPs are from matrix multiplication. In the inner loop, ([#alg1:Algorithm 1] line 9), we compute $\mathbf{Q}_i \mathbf{K}_j^\top \in \mathbb{R}^{B_r \times B_c}$ for $\mathbf{Q}_i \in \mathbb{R}^{B_r \times d}$ and $\mathbf{K}_j \in \mathbb{R}^{B_c \times d}$, which takes $O(B_r B_c d)$ FLOPs. We also compute ([#alg1:Algorithm 1] line 12) $\tilde{\mathbf{P}}_{ij} \mathbf{V}_j \in \mathbb{R}^{B_r \times d}$ for $\tilde{\mathbf{P}}_{ij} \in \mathbb{R}^{B_r \times B_c}$ and $\mathbf{V}_j \in \mathbb{R}^{B_c \times d}$, which takes $O(B_r B_c d)$ FLOPs. We execute the inner loops $T_c T_r = \left\lceil \frac{N}{B_c} \right\rceil \left\lceil \frac{N}{B_r} \right\rceil$ times. Therefore the total number of FLOPs is`),
        eq(r`O\left(\frac{N^2}{B_c B_r} B_r B_c d\right) = O(N^2 d).`),
        p(r`In terms of extra memory required, we see that we need $O(N)$ memory to store the statistics $(\ell, m)$.`),
        p(r`We now prove the algorithm's correctness by induction on $j$ for $0 \le j \le T_c$. Let $\mathbf{K}_{:j} \in \mathbb{R}^{jB_c \times d}$ be the first $jB_c$ rows of $\mathbf{K}$, and similarly $\mathbf{V}_{:j} \in \mathbb{R}^{jB_c \times d}$ the the first $jB_c$ rows of $\mathbf{V}$. Let $\mathbf{S}_{:,:j} = \mathbf{Q}\mathbf{K}_{:j}^\top \in \mathbb{R}^{N \times jB_c}$, and $\mathbf{P}_{:,:j} = \mathrm{softmax}(\mathbf{S}_{:,:j}) \in \mathbb{R}^{N \times jB_c}$ (softmax applied row-wise). Let $m^{j}, \ell^{(j)}, \mathbf{O}^{(j)}$ be the values of $m, \ell, \mathbf{O}$ in HBM after the $j$-th iteration of the outer loop ([#alg1:Algorithm 1] line 5). (Note that these values of $m, \ell, \mathbf{O}$ are updated after each iteration of the outer loop.) We want to show that after the $j$-th iteration of the outer loop, we have computed in HBM:`),
        eq(r`m^{(j)} = \mathrm{rowmax}(\mathbf{S}_{:,:j}) \in \mathbb{R}^N, \quad \ell^{(j)} = \mathrm{rowsum}\left(\exp(\mathbf{S}_{:,:j} - m^{(j)})\right) \in \mathbb{R}^N, \quad \mathbf{O}^{(j)} = \mathbf{P}_{:,:j} \mathbf{V}_{:j} \in \mathbb{R}^{N \times d}.`),
        p(r`Based on our initialization ([#alg1:Algorithm 1] line 2), this claim is true for $j = 0$ (i.e., before the any iteration of the outer loop is executed). Suppose that the claim holds for some $j = 0, \dots, T_c - 1$. We want to show that the claim also holds for $j + 1$. Indeed, when we update the statistics in the inner loop ([#alg1:Algorithm 1] line 10) on the $(j + 1)$-th iteration of the outer loop, we update $m^{(j+1)} = \max(m^{(j)}, \tilde{m})$ where $\tilde{m} \in \mathbb{R}^N$ is the row-max of $\mathbf{S}_{:,j:j+1}$, the slice of $\mathbf{S}$ from column $jB_c$ to column $(j + 1)B_c - 1$. This implies that`),
        eq(r`m^{(j+1)} = \mathrm{rowmax}(\mathbf{S}_{:,:j+1}) \in \mathbb{R}^N.`),
        p(r`Similarly, we update`),
        eq(r`\ell^{(j+1)} = e^{m^{(j)} - m^{(j+1)}} \ell^{(j)} + e^{\tilde{m} - m^{(j+1)}} \tilde{\ell},`),
        p(r`where $\tilde{\ell} = \mathrm{rowsum}(\exp(\mathbf{S}_{:,j:j+1} - \tilde{m})) \in \mathbb{R}^N$. By the same algebraic manipulation in [#sec-3-1:Section 3.1], we obtain:`),
        eq(r`\ell^{(j+1)} = \mathrm{rowsum}\left(\exp(\mathbf{S}_{:,:j+1} - m^{(j+1)})\right) \in \mathbb{R}^N.`),
        p(r`Let $\mathbf{V}_{j:j+1}$ be the slice of $\mathbf{V}$ from column $jB_c$ to column $(j + 1)B_c - 1$, we also update:`),
        eq(r`\begin{aligned}
\mathbf{O}^{(j+1)} &= \mathrm{diag}(\ell^{(j+1)})^{-1}\left(\mathrm{diag}(\ell^{(j)}) e^{m^{(j)} - m^{(j+1)}} \mathbf{O}^{(j)} + e^{\tilde{m} - m^{(j+1)}} \exp(\mathbf{S}_{j:j+1} - \tilde{m}) \mathbf{V}_{j:j+1}\right) \\
&= \mathrm{diag}(\ell^{(j+1)})^{-1}\left(\mathrm{diag}(\ell^{(j)}) e^{m^{(j)} - m^{(j+1)}} \mathbf{P}_{:,:j} \mathbf{V}_{:j} + e^{-m^{(j+1)}} \exp(\mathbf{S}_{j:j+1}) \mathbf{V}_{j:j+1}\right) \\
&= \mathrm{diag}(\ell^{(j+1)})^{-1}\left(\mathrm{diag}(\ell^{(j)}) e^{m^{(j)} - m^{(j+1)}} \mathrm{diag}(\ell^{(j)}) \exp(\mathbf{S}_{:,:j} - m^{(j)}) \mathbf{V}_{:j} + e^{-m^{(j+1)}} \exp(\mathbf{S}_{j:j+1}) \mathbf{V}_{j:j+1}\right) \\
&= \mathrm{diag}(\ell^{(j+1)})^{-1}\left(e^{-m^{(j+1)}} \exp(\mathbf{S}_{:,:j}) \mathbf{V}_{:j} + e^{-m^{(j+1)}} \exp(\mathbf{S}_{j:j+1}) \mathbf{V}_{j:j+1}\right) \\
&= \mathrm{diag}(\ell^{(j+1)})^{-1}\left(\exp(\mathbf{S}_{:,:j} - m^{(j+1)}) \mathbf{V}_{:j} + \exp(\mathbf{S}_{j:j+1} - m^{(j+1)}) \mathbf{V}_{j:j+1}\right) \\
&= \mathrm{diag}(\ell^{(j+1)})^{-1}\left(\exp\left(\begin{bmatrix} \mathbf{S}_{:,:j} & \mathbf{S}_{j:j+1} \end{bmatrix} - m^{(j+1)}\right)\right) \begin{bmatrix} \mathbf{V}_{:j} \\ \mathbf{V}_{j:j+1} \end{bmatrix} \\
&= \mathrm{softmax}(\mathbf{S}_{:j+1}) \mathbf{V}_{:j+1}.
\end{aligned}`, { id: "eq-induction", label: "Inductive output update" }),
        p(r`We then see that the claim is also true for $j + 1$. By induction, the claim is true for all $j = 0, \dots, T_c$.`),
        p(r`When $j = T_c$, we conclude that the final value of $\mathbf{O}$ in HBM is $\mathrm{softmax}(\mathbf{S})\mathbf{V} = \mathrm{softmax}(\mathbf{Q}\mathbf{K}^\top)\mathbf{V}$.`),
      ],
    },
    {
      type: "proof", of: "Theorem 2", target: "thm2", id: "proof-thm2",
      blocks: [
        p(r`We first analyze the IO complexity of standard attention implementation. The inputs $\mathbf{Q}, \mathbf{K}, \mathbf{V} \in \mathbb{R}^{N \times d}$ reside in HBM, and the at the end of the algorithm the output $\mathbf{O} \in \mathbb{R}^{N \times d}$ is written to HBM.`),
        p(r`In the first step of computing the matrix multiply $\mathbf{S} = \mathbf{Q}\mathbf{K}^\top$, the inputs $\mathbf{Q}, \mathbf{K}$ are read from HBM and the output $\mathbf{S} \in \mathbb{R}^{N \times N}$ is written to HBM ([#alg0:Algorithm 0] line 1). This incurs $\Theta(Nd + N^2)$ HBM accesses.`),
        p(r`In the second step of computing $\mathbf{P} = \mathrm{softmax}(\mathbf{S})$, the input $\mathbf{S}$ is read from HBM and the output $\mathbf{P}$ is written to HBM ([#alg0:Algorithm 0] line 2). This incurs $\Theta(N^2)$ HBM accesses.`),
        p(r`In the last step of computing $\mathbf{O} = \mathbf{P}\mathbf{V}$, the inputs $\mathbf{P}, \mathbf{V}$ are read from global memory and the output $\mathbf{O}$ is written to HBM ([#alg0:Algorithm 0] line 3). This incurs $\Theta(Nd + N^2)$ HBM accesses.`),
        p(r`Overall, standard attention implementation requires $\Theta(Nd + N^2)$ global memory accesses.`),
        p(r`We now analyze the IO complexity of streaming attention.`),
        p(r`Following [#alg1:Algorithm 1], we see that each element of $\mathbf{K}$ and $\mathbf{V}$ is loaded from HBM once ([#alg1:Algorithm 1] line 6). We make $T_c$ passes over $\mathbf{Q}$ and $\mathbf{O}$, each pass loading all of $\mathbf{Q}$ and all of $\mathbf{O}$ to HBM ([#alg1:Algorithm 1] line 8). Therefore the number of HBM accesses is $\Theta(Nd + NdT_c) = \Theta(NdT_c)$.`),
        p(r`We derive the conditions on the block sizes $B_c$ and $B_r$. We need the blocks $\mathbf{K}_j$ and $\mathbf{V}_j$ of size $B_c \times d$ to fit into on-chip memory, which translates to:`),
        eq(r`B_c d = O(M) \Leftrightarrow B_c = O\left(\frac{M}{d}\right).`),
        p(r`Similarly, we need the blocks $\mathbf{Q}_i, \mathbf{O}_i$ of size $B_r \times d$ to fit into on-chip memory, which translates to:`),
        eq(r`B_r d = O(M) \Leftrightarrow B_r = O\left(\frac{M}{d}\right).`),
        p(r`Finally, we need the block $\mathbf{S}_{ij}$ of size $B_r \times B_c$ to fit into on-chip memory, which translates to:`),
        eq(r`B_r B_c = O(M).`),
        p(r`We therefore set:`),
        eq(r`B_c = \Theta\left(\frac{M}{d}\right), \qquad B_r = \Theta\left(\min\left(\frac{M}{d}, \frac{M}{B_c}\right)\right) = \Theta\left(\min\left(\frac{M}{d}, d\right)\right).`),
        p(r`We then have:`),
        eq(r`T_c = \frac{N}{B_c} = \Theta\left(\frac{Nd}{M}\right).`),
        p(r`As a result, the number of HBM accesses is:`),
        eq(r`\Theta\left(NdT_c\right) = \Theta\left(\frac{N^2 d^2}{M}\right).`, { id: "eq-io-fwd", label: "Forward-pass IO complexity" }),
      ],
    },
    {
      type: "proof", of: "Proposition 3", target: "prop3", id: "proof-prop3",
      blocks: [
        p(r`For contradiction, suppose that there exists an algorithm that computes exact attention where the number for HBM access for all $M \in [d, Nd]$ is`),
        eq(r`o\left(\frac{N^2 d^2}{M}\right).`),
        p(r`In the regime of $M = \Theta(Nd)$, this results in the number of HBM accesses:`),
        eq(r`o\left(\frac{N^2 d^2}{Nd}\right) = o(Nd).`),
        p(r`However, the input to attention (matrices $\mathbf{Q}, \mathbf{K}, \mathbf{V}$) and the output $\mathbf{O}$ have size $Nd$ and they start out being in HBM, so if the algorithm computes exact attention it must incur at least $\Omega(Nd)$ HBM accesses. This is a contradiction.`),
      ],
    },
    {
      type: "proof", of: "Theorem 5", target: "thm5", id: "proof-thm5",
      blocks: [
        p(r`The IO complexity of the attention backward is very similar to the IO complexity of the attention forward ([#thm2:Theorem 2]). Here we provide a sketch of the proof.`),
        p(r`We first analyze the IO complexity of standard attention backward pass. The inputs $\mathbf{Q}, \mathbf{K}, \mathbf{V}, \mathbf{dO} \in \mathbb{R}^{N \times d}$ reside in HBM, and the at the end of the algorithm the outputs $\mathbf{dQ}, \mathbf{dK}, \mathbf{dV} \in \mathbb{R}^{N \times d}$ are written to HBM.`),
        p(r`At each step of the standard attention backward pass, one needs to load inputs of size $Nd$ or $N^2$ from HBM, and needs to write the outputs of size $N^2$ or $Nd$ to HBM. This incurs $\Theta(Nd + N^2)$ HBM accesses.`),
        p(r`We now analyze the IO complexity of FlashAttention backward pass.`),
        p(r`Similar to [#thm2:Theorem 2], we see that each element of $\mathbf{K}$ and $\mathbf{V}$ is loaded from HBM once. Each element of $\mathbf{dK}$ and $\mathbf{dV}$ is only written to HBM once. We make $T_c$ passes over $\mathbf{Q}, \mathbf{O}, \mathbf{dO}$, each pass loading all of $\mathbf{Q}, \mathbf{O}, \mathbf{dO}$ to HBM. We also make $T_c$ passes over $\mathbf{dQ}$, each pass reading/writing all of $\mathbf{dQ}$ from/to HBM. Therefore the number of HBM accesses is $\Theta(Nd + NdT_c) = \Theta(NdT_c)$.`),
        p(r`As in the proof of [#thm2:Theorem 2], the constraints on the block sizes are that:`),
        eq(r`B_c = \Theta\left(\frac{M}{d}\right), \qquad B_r = \Theta\left(\min\left(\frac{M}{d}, d\right)\right).`),
        p(r`We then have:`),
        eq(r`T_c = \frac{N}{B_c} = \Theta\left(\frac{Nd}{M}\right).`),
        p(r`As a result, the number of HBM accesses is:`),
        eq(r`\Theta\left(NdT_c\right) = \Theta\left(\frac{N^2 d^2}{M}\right).`),
      ],
    },

    // ── Appendix D ─────────────────────────────────────────────────────────
    h(1, "D", "Extension Details", "app-d"),
    h(2, "D.1", "Block-sparse FlashAttention", "app-d-1"),
    p(r`We describe the full block-sparse FlashAttention algorithm in [#alg5:Algorithm 5]. The algorithm is identical to [#alg2:Algorithm 2], except that we skip zero blocks.`),
    {
      type: "algorithm", id: "alg5", number: "5", title: "Block-Sparse FlashAttention Forward Pass",
      require: [r`Matrices $\mathbf{Q}, \mathbf{K}, \mathbf{V} \in \mathbb{R}^{N \times d}$ in HBM, on-chip SRAM of size $M$, softmax scaling constant $\tau \in \mathbb{R}$, masking function $\operatorname{MASK}$, dropout probability $p_{\text{drop}}$, block sizes $B_c = \left\lceil \frac{M}{4d} \right\rceil, B_r = \min\left(\left\lceil \frac{M}{4d} \right\rceil, d\right)$, block sparsity mask $M \in \{0, 1\}^{N/B_r \times N/B_c}$.`],
      lines: [
        L(0, r`Initialize the pseudo-random number generator state $\mathcal{R}$ and save to HBM.`),
        L(0, initOLM),
        L(0, divideQKV),
        L(0, divideOLM),
        L(0, forJ),
        L(1, loadKV),
        L(1, forI),
        L(2, r`**if** $M_{ij} \ne 0$ **then**`),
        L(3, loadQOLM),
        ...maskedFwdBody(3),
        L(2, r`**end if**`),
        L(1, r`**end for**`),
        L(0, r`**end for**`),
        L(0, r`Return $\mathbf{O}, \ell, m, \mathcal{R}$.`),
      ],
    },
    p(r`We prove the IO-complexity of block-sparse FlashAttention.`),
    {
      type: "proof", of: "Proposition 4", target: "prop4", id: "proof-prop4",
      blocks: [
        p(r`The proof is very similar to the proof of [#thm2:Theorem 2]. For the block-sparse case, notice that we only need to load blocks corresponding to nonzero blocks. As a result, the number of HBM accesses are scaled by $s$, the fraction of nonzero blocks in the block-sparsity mask. However, for small values of $s$, we would still need to write the result $\mathbf{O} \in \mathbb{R}^{N \times d}$. Therefore the number of HBM accesses is`),
        eq(r`\Theta\left(Nd + \frac{N^2 d^2}{M} s\right).`, { id: "eq-io-sparse", label: "Block-sparse IO complexity" }),
      ],
    },
    h(2, "D.2", "Potential Extensions", "app-d-2"),
    p(r`We discuss here a few potential extensions of the IO-aware approach to speed up deep learning training.`),
    p(r`Large language models are trained on hundreds or thousands of GPUs, and one typically splits the attention computation between 4-8 GPUs on the same node [@77]. This introduces another level of memory hierarchy: beside GPU SRAM and GPU HBM, we also have the HBM of other GPUs. For very long sequences, the different GPUs on the same node can cooperate to compute attention by taking into account the asymmetry of different levels of memory hierarchy.`, "Multi-GPU Attention."),
    p(r`Typical dense MLP layers are compute-bound and not memory-bound. To improve their efficiency, MLP layers with sparse weight matrices can be used [@17]. However, many sparse MLP layers are instead memory-bound, and their speedup is often not proportional to the sparsity. We believe that an IO-aware implementation can alleviate this issue and realize the benefits of sparsity. We are excited about future work in this direction, to reduce the computational requirement of large models and improve their wall-block runtime.`, "Sparse MLP layers."),
    p(r`Our approach in FlashAttention relies on the fact that the $N \times N$ attention matrix is a function of a low-rank matrix $\mathbf{Q}\mathbf{K}^\top$ (of rank $d \ll N$). As a result, we can repeatedly load the inputs $\mathbf{Q}, \mathbf{K}$ and recompute the block of the attention matrix that we need, significantly reducing HBM access. As similar scenario happens in kernel machine learning: each element $K_{ij}$ of the $N \times N$ kernel matrix $\mathbf{K}$ is a function of two vectors of size $d \ll N$, as it measures the similarity between two datapoints $x_i$ and $x_j$. The KeOps library [@8, 26] is a successful example of how reducing memory reads/writes can speed up kernel operations. We hope that this will motivate kernel methods that focus more on reducing IOs instead of just FLOPs.`, "Kernel machine learning."),

    // ── Appendix E ─────────────────────────────────────────────────────────
    h(1, "E", "Full Experimental Results", "app-e"),
    h(2, "E.1", "BERT", "app-e-1"),
    p(r`We train BERT-large following the training procedure and hyperparameters of the reference MLPerf 1.1 implementation. In particular, we use the LAMB optimizer with learning rate 3.75e-3, with batch size 448, trained for at most 7100 steps. The training is stopped once the validation accuracy (for masked language modeling) reaches the target 72.0%, and the wall-clock run-time is measured. We train with FP16 precision using Apex AMP (with O2 optimization level).`),
    p(r`We compare our results with the reported training speed from Nvidia that was submitted to MLPerf 1.1 ([#tab1:Table 1]).`),
    p(r`We use the same train / validation data split provided by MLPerf 1.1 reference implementation. In particular, we evaluate on the same 10000 validation examples as the baseline from Nvidia.`),
    p(r`We train the model on 8×A100-80GB GPUs. Each training run takes between 16 and 19 minutes, and we average the results of 10 runs.`),
    h(2, "E.2", "GPT-2", "app-e-2"),
    p(r`We use the standard implementations of GPT-2 [@67] from Huggingface transformers library and from Nvidia's Megatron-LM repo. We follow the training recipe of the Megatron-LM repo.`),
    p(r`We use an effective batch size of 512, and use gradient accumulation to fit into available GPU memory. We use the AdamW optimizer, with learning rate 6e-4 for GPT-2 small and 1.5e-4 for GPT-2 medium, and weight decay of 0.1. All models are trained with the same hyperparameters for 400K steps. We run all implementations with mixed-precision training (PyTorch AMP).`),
    p(r`We use the Openwebtext dataset, with the GPT-2 BPE tokenizer. We randomly select 0.5% of the dataset as the validation set, with the rest being used as training set. This random selection of validation set is done once, and all models are evaluated on the same validation set.`),
    p(r`We train the model on 8×A100-40GB GPUs, and we measure the wall-clock training time. Training GPT-2 small takes between 2.7-9.5 days, and training GPT-2 medium takes between 6.9-21.0 days ([#tab2:Table 2]).`),
    p(r`In [#fig4:Fig. 4], we plot of the validation perplexity throughout training of GPT-2 small/medium, using either HuggingFace implementation or our FlashAttention implementation. We see that FlashAttention behaves the same as the baseline implementation and the validation perplexity curves of the two implementations almost lie on top of each other.`),
    {
      type: "figure", id: "fig4", number: "4",
      images: [{ src: "figures/fig4.png", alt: "Validation perplexity versus training steps (0–400k) for GPT-2 small and medium with HuggingFace and FlashAttention; each pair of curves overlaps, ending near 18 (small) and 14 (medium)." }],
      caption: r`Validation perplexity of GPT-2 small/medium using two implementations. We confirm that FlashAttention yields the same validation curves as the baseline implementation from HuggingFace.`,
    },
    p(r`For MIMIC-III and ECtHR, we follow the hyperparameters of Dai et al. [@13].`, "Long Document Classification."),
    h(2, "E.3", "LRA details", "app-e-3"),
    p(r`We follow the hyperparameters from the Long-range arena paper [@80], the Long-range arena repo ([github.com/google-research/long-range-arena](https://github.com/google-research/long-range-arena)), and the Nyströmformer reproduction [@90]. To be generous to the baseline methods, if we are unable to reproduce the performance of any baseline for any of the five tasks, we report the better performance from Tay et al. [@80] or Xiong et al. [@90] for that baseline on that task.`),
    p(r`After hyperparameter tuning, almost all of the attention methods achieve similar accuracy on all of the five LRA tasks.`),
    p(r`We run all methods with mixed-precision training, except for Performer (not stable with mixed precision) and Local Attention (implementation does not support FP16).`),
    p(r`To calculate the overall wallclock-time speedup, we take the geometric mean of the wallclock-time speedup of each of the five tasks.`),
    p(r`For Path-X and Path-256, we follow the hyperparameters from the PathFinder-32 experiments from the long-range arena paper[@80]. For both, we first pretrain a model on Path-64. We take the checkpoint after 200 epochs, upsample its positional embedding (we duplicate the positional embeddings gridwise in space), and fine-tune it on the downstream task for 200 epochs with one epoch of linear warmup, and cosine decay of the learning rate. For Path-X, we take the best performing checkpoint (according to val accuracy), and additionally fine-tune it for 200 epochs with the same warmup and learning rate (this adds roughly 4 points of accuracy to FlashAttention for Path-X, but the model starts overfitting afterwards).`, "Path-X"),
    h(2, "E.4", "Comparison with Apex FMHA", "app-e-4"),
    p(r`We compare our method/implementation with Apex FMHA ([github.com/NVIDIA/apex/…/fmha](https://github.com/NVIDIA/apex/tree/master/apex/contrib/csrc/fmha)).`),
    p(r`When we started this project, Apex FMHA was the fastest implementation of attention (that we knew of), tailored for short sequences of length at most 512. In fact, almost all MLPerf submissions for BERT training benchmark running on Nvidia GPUs use FMHA for their model code, as of MLPerf 1.1 [@58]. Since FMHA targets BERT models, it only supports head dimension 64, and only runs on A100 GPUs. FMHA fuses the attention computation $\mathrm{dropout}(\mathrm{softmax}(\operatorname{MASK}(\mathbf{Q}\mathbf{K}^\top)))\mathbf{V}$ into one CUDA kernel. In the forward pass, it stores the attention matrix $\mathrm{softmax}(\operatorname{MASK}(\mathbf{Q}\mathbf{K}^\top))$ to HBM to be used in gradient computation. As a result, it does not offer substantial memory saving (though for shorter sequences memory footprint is often not a primary concern).`),
    p(r`We use FMHA code as a starting point, and apply two well-established techniques (tiling and recomputation) to deal with long sequences and to save memory as mentioned in [#sec-3:Section 3]. As a result, we can support much longer sequences (e.g., up to length 64K). We also support more head dimensions (16, 32, 64, 128) and broader GPU types (all Turing and Ampere GPUs at the time of writing).`),
    p(r`In [#tab7:Table 7], we compare the performance of FlashAttention and Apex FMHA for short sequences (as FMHA only supports sequence length at most 512). Generally FlashAttention is slightly faster than FMHA in the forward pass and slightly slower than FMHA in the backward pass. This is because we do not store the attention matrix in the forward pass and recompute it in the backward pass. Compared to FMHA, the overall runtime of FlashAttention is about 4% slower for sequence length 128, 8% faster for sequence length 256, and 5% faster for sequence length 512.`),
    {
      type: "table", id: "tab7", number: "7",
      caption: r`Runtime (ms) of FlashAttention compared to FMHA by sequence length, with masking and dropout, measured on an A100-SXM4-40GB GPU. Batch size 64, 16 heads, head dimension 64 (i.e., BERT-large size).`,
      columns: [
        { key: "m", label: "Attention Method", align: "left" },
        { key: "128", label: "128", numeric: true },
        { key: "256", label: "256", numeric: true },
        { key: "512", label: "512", numeric: true },
      ],
      rows: [
        ["Apex FMHA forward", "0.10", "0.29", "1.14"],
        { cells: ["FlashAttention forward", "**0.08**", "**0.22**", "**0.81**"], ours: true },
        { cells: ["Apex FMHA backward", "**0.17**", "**0.52**", "**1.81**"], divider: true },
        { cells: ["FlashAttention backward", "0.20", "0.53", "2.00"], ours: true },
        { cells: ["Apex FMHA forward + backward", "**0.27**", "0.81", "2.95"], divider: true },
        { cells: ["FlashAttention forward + backward", "0.28", "**0.75**", "**2.81**"], ours: true },
      ],
      chart: {
        kind: "line", mode: "rows-as-series", xLabel: "Sequence length", yLabel: "Runtime (ms)",
        encode: {
          color: [{ match: "FlashAttention", slot: 0, group: "FlashAttention" }, { match: "FMHA", slot: 1, group: "Apex FMHA" }],
          dash: [{ match: "forward \\+ backward", type: "solid" }, { match: "backward", type: "dotted" }, { match: "forward", type: "dashed" }],
        },
      },
    },
    h(2, "E.5", "Speedup On Different Hardware and Configurations", "app-e-5"),
    p(r`Speedup varies between different types of GPU types and generations depending on HBM bandwidth and SRAM size. In this section, we profile FlashAttention speedup on different GPUs and configurations.`),
    {
      type: "figure", id: "fig5", number: "5",
      images: [{ src: "figures/fig5.png", alt: "Bar chart of FlashAttention speedup on A100 (d=64) across sequence lengths 128–4096 for four settings: dropout+masking, masking only, dropout only, and no masking/no dropout; speedups range roughly 1.5× to 4×." }],
      caption: r`Speedup over standard PyTorch attention at different sequence lengths, on A100.`,
    },
    p(r`[#fig5:Figure 5] shows speedup on an A100 GPU with batch size 8, head dimension 64, and 12 attention heads, across different sequence lengths. We generally see 2-4× speedup, and we see more speedup when using dropout and masking due to kernel fusion.`, "A100"),
    {
      type: "figure", id: "fig6", number: "6",
      images: [{ src: "figures/fig6.png", alt: "Bar chart of FlashAttention speedup on A100 with head dimension 128 across sequence lengths 128–2048; causal mask speedup rises to about 3.2× at 2048 while no-masking/no-dropout falls to about 1×." }],
      caption: r`Speedup over standard PyTorch attention at different sequence lengths, on A100, with head dimension 128.`,
    },
    p(r`Speedup also changes when we increase the head dimension. Each block requires more memory, so we need to use smaller block sizes to fit into SRAM. [#fig6:Figure 6] shows speedup with head dimension 128 on an A100 (batch size 16, 12 heads). We see less speedup overall—but we can still see significant speedup (up to 3×) with a causal mask, where half the blocks are masked out.`, "A100, Head Dimension 128"),
    {
      type: "figure", id: "fig7", number: "7",
      images: [{ src: "figures/fig7.png", alt: "Bar chart of FlashAttention speedup on RTX 3090 across sequence lengths 128–2048; dropout+masking speedup grows from about 2.9× to 4.6×." }],
      caption: r`Speedup over standard PyTorch attention at different sequence lengths, on RTX 3090.`,
    },
    p(r`[#fig7:Figure 7] shows speedup on an RTX 3090 GPU. Here, we use batch size 12 with 12 attention heads. We observe slightly higher speedups on the RTX 3090 (between 2.5-4.5×), since the memory bandwidth on an RTX 3090 is lower than on an A100 (roughly 900 GB/s vs. 1.5 TB/s).`, "RTX 3090"),
    p(r`[#fig8:Figure 8] shows speedup on a T4 GPU. T4 SRAM is smaller than A100, so we need to make the block sizes smaller in FlashAttention. As a result, we observe less speedup on T4, which matches the IO complexity analysis in [#sec-3-2:Section 3.2]. T4 GPUs are commonly used for inference, so we also report speedup on the forward pass only.`, "T4"),
    {
      type: "figure", id: "fig8", number: "8",
      images: [
        { src: "figures/fig8a.png", alt: "Bar chart of combined forward+backward FlashAttention speedup on T4 across sequence lengths.", label: "Top" },
        { src: "figures/fig8b.png", alt: "Bar chart of forward-only FlashAttention speedup on T4 across sequence lengths.", label: "Bottom" },
      ],
      caption: r`Speedup over standard PyTorch attention at different sequence lengths, on T4. **Top:** Combined forward pass + backward pass. **Bottom:** Forward pass only.`,
    },
    h(2, "E.6", "Full Benchmarking Results", "app-e-6"),
    p(r`We report the full benchmarking results and experimental details on A100.`),
    p(r`We compare against reference implementations for exact attention from PyTorch/HuggingFace and Megatron, approximate attention, and sparse attention. For approximate attention, we compare against reference implementations of Reformer [@51], Local Attention [@68], Linformer Attention [@84], Smyrf [@19], and LongShortFormer (LSFormer) [@94]. For sparse attention, we compare against reference implementations of Block-Sparse Attention form OpenAI [@11], Longformer[@3], and BigBird Attention [@92]. For the approximate and sparse attention, we use a compression ratio of 1/8, or a compressed sequence length of 256, whichever is smaller.`, "Baselines"),
    p(r`We measure runtime and memory usage of the attention computation with 8 heads of dimension 64, and batch size 16 on a machine with one A100 GPU with 40 GB of GPU HBM. We vary sequence length in our experiments. We compute attention on random vectors for $\mathbf{Q}$, $\mathbf{K}$, and $\mathbf{V}$ (we do not measure the projection from the hidden layer). For dropout, we use dropout 0.1; for masking, we use a padding mask with uniformly-random mask lengths between the total sequence length and the total sequence length minus 20. To measure runtime, we take the average of 100 measurements of the attention call. We only measure memory footprint once, since it does not vary between runs.`, "Setup"),
    p(r`We report timing results on the forward pass, backward pass, and combined forward + backward pass. We measure each method with and without dropout, masking, or both—except for Block Sparse, Longformer, and BigBird. These methods did not successfully run the backward pass with masking due to a bug in external libraries, so we measured them without masking to be generous. We use FP16 for all measurements, except for Local Attention, whose implementation only supports FP32.`),
    p(r`For each baseline, we increase sequence length until it runs out of memory on the GPU, except for the following exceptions: The Megatron implementation does not support sequence lengths longer than 2048. Block-Sparse (OpenAI) does not support sequence lengths longer than 4096. Longformer and BigBird do not support sequence lengths longer than 8092.`),
    p(r`We measure memory usage on the combined forward + backward pass, without dropout or masking.`),
    p(r`[#tab8:Table 8] summarizes all the experimental configurations and contains pointers to the results tables.`, "Results"),
    {
      type: "table", id: "tab8", number: "8",
      caption: r`Pointers to results tables.`,
      columns: [
        { key: "d", label: "Dropout" },
        { key: "m", label: "Masking" },
        { key: "p", label: "Pass" },
        { key: "t", label: "Table" },
      ],
      rows: [
        ["Yes", "Yes", "Forward", "[#tab9:Table 9]"],
        ["Yes", "Yes", "Backward", "[#tab10:Table 10]"],
        ["Yes", "Yes", "Combined", "[#tab11:Table 11]"],
        ["No", "Yes", "Forward", "[#tab12:Table 12]"],
        ["No", "Yes", "Backward", "[#tab13:Table 13]"],
        ["No", "Yes", "Combined", "[#tab14:Table 14]"],
        ["Yes", "No", "Forward", "[#tab15:Table 15]"],
        ["Yes", "No", "Backward", "[#tab16:Table 16]"],
        ["Yes", "No", "Combined", "[#tab17:Table 17]"],
        ["No", "No", "Forward", "[#tab18:Table 18]"],
        ["No", "No", "Backward", "[#tab19:Table 19]"],
        ["No", "No", "Combined", "[#tab20:Table 20]"],
        ["No", "No", "Memory Usage (Combined)", "[#tab21:Table 21]"],
      ],
    },
    { type: "benchmark-tables" }, // expanded by the build script into Tables 9–21
  ],
};
