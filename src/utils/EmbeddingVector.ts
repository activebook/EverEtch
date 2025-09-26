
export class EmbeddingVector {
    /**
     * Calculate cosine similarity between two embeddings
     */
    static cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Embeddings must have the same dimensions');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Calculate Euclidean distance between two embeddings
     */
    static euclideanDistance(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Embeddings must have the same dimensions');
        }

        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            const diff = a[i] - b[i];
            sum += diff * diff;
        }

        return Math.sqrt(sum);
    }

    /**
     * Normalize an embedding vector to unit length
     */
    static normalizeEmbedding(embedding: number[]): number[] {
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

        if (magnitude === 0) {
            return embedding;
        }

        return embedding.map(val => val / magnitude);
    }

    /**
     * Normalize an embedding vector to unit length (Fast version)
     * Always use this method for large embeddings
     * @param embedding 
     */
    static normalizeEmbeddingFast(embedding: number[]): number[] {
        const n = embedding.length;
        if (n === 0) return embedding;

        // accumulate sum of squares with 8x unrolling
        let sum = 0;
        let i = 0;
        const unroll = 8;
        const limit = n - (n % unroll);

        for (; i < limit; i += unroll) {
            const a0 = embedding[i]; const a1 = embedding[i + 1];
            const a2 = embedding[i + 2]; const a3 = embedding[i + 3];
            const a4 = embedding[i + 4]; const a5 = embedding[i + 5];
            const a6 = embedding[i + 6]; const a7 = embedding[i + 7];
            sum += a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3 + a4 * a4 + a5 * a5 + a6 * a6 + a7 * a7;
        }
        for (; i < n; i++) {
            const v = embedding[i];
            sum += v * v;
        }

        if (sum === 0) return embedding;
        const inv = 1 / Math.sqrt(sum);

        // normalize in-place, unrolled
        i = 0;
        for (; i < limit; i += unroll) {
            embedding[i] *= inv;
            embedding[i + 1] *= inv;
            embedding[i + 2] *= inv;
            embedding[i + 3] *= inv;
            embedding[i + 4] *= inv;
            embedding[i + 5] *= inv;
            embedding[i + 6] *= inv;
            embedding[i + 7] *= inv;
        }
        for (; i < n; i++) embedding[i] *= inv;

        return embedding;
    }


    /**
     * Normalize an embedding vector to unit length (Optimized version)
     * More efficient for 2048-dimensional vectors with manual loops
     */
    static normalizeEmbeddingOptimized(embedding: number[]): number[] {
        // Use more efficient magnitude calculation
        let sumOfSquares = 0;
        for (let i = 0; i < embedding.length; i++) {
            sumOfSquares += embedding[i] * embedding[i];
        }

        const magnitude = Math.sqrt(sumOfSquares);

        if (magnitude === 0) {
            return embedding;
        }

        // Pre-create result array for better performance
        const normalized: number[] = new Array(embedding.length);
        for (let i = 0; i < embedding.length; i++) {
            normalized[i] = embedding[i] / magnitude;
        }

        return normalized;
    }

    /**
     * Get embedding dimensions for different models
     * Deprecated - use 2048 dimensions for all models now
     */
    static getEmbeddingDimensions(modelName: string): number {
        const dimensions: Record<string, number> = {
            // OpenAI models
            'text-embedding-ada-002': 1536,
            'text-embedding-3-small': 1536,
            'text-embedding-3-large': 3072,
            // Google models
            'gemini-embedding-001': 768,
        };

        return dimensions[modelName] || 768; // Default to Google dimensions
    }

    /**
   * Pad embedding to target dimensions with zeros (no extra spread).
   * Returns a new array; use the in-place variant if mutation is okay.
   */
    static padTo(embedding: number[], targetDim: number): number[] {
        const current = embedding.length;
        if (current >= targetDim) return embedding;

        const out = new Array(targetDim);
        // Copy existing values
        for (let i = 0; i < current; i++) out[i] = embedding[i];
        // Zero-fill tail
        for (let i = current; i < targetDim; i++) out[i] = 0;
        return out;
    }

    /**
     * In-place padding (mutates the input!). Fastest when mutation is acceptable.
     */
    static padToInPlace(embedding: number[], targetDim: number): number[] {
        const current = embedding.length;
        if (current >= targetDim) return embedding;
        embedding.length = targetDim; // creates holes; fill them with zeros
        for (let i = current; i < targetDim; i++) embedding[i] = 0;
        return embedding;
    }

    /**
     * Area-preserving downsampling to targetDim by proportional overlap.
     * Works for any ratio and avoids division-by-zero / empty bins.
     */
    static downsampleOverlap(embedding: number[], targetDim: number): number[] {
        const srcN = embedding.length;
        if (srcN <= targetDim) return EmbeddingVector.padTo(embedding, targetDim);

        const ratio = srcN / targetDim; // how many source samples per target bin
        const out = new Array(targetDim).fill(0);

        let srcIdx = 0;
        let srcRemain = 1; // remaining fraction of current source sample
        for (let t = 0; t < targetDim; t++) {
            let remain = ratio; // how much source width should contribute to this bin
            let acc = 0;

            while (remain > 0) {
                const take = Math.min(srcRemain, remain);
                acc += embedding[srcIdx] * take;
                remain -= take;
                srcRemain -= take;

                if (srcRemain === 0) {
                    srcIdx++;
                    srcRemain = 1;
                }
            }

            // Normalize by bin width => average for this target bin
            out[t] = acc / ratio;
        }

        return out;
    }

    /**
     * Normalize embedding to exactly 2048 dimensions.
     * Choose your downsampling strategy based on fidelity vs speed.
     */
    static normalizeTo2048(embedding: number[]): number[] {
        const currentDim = embedding.length;
        if (currentDim === 2048) return embedding;
        if (currentDim < 2048) return EmbeddingVector.padTo(embedding, 2048);

        // Prefer overlap for correctness; switch to linear for speed if acceptable.
        return EmbeddingVector.downsampleOverlap(embedding, 2048);
        // return downsampleLinear(embedding, 2048); // faster alternative
    }
}
