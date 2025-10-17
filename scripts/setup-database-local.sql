-- Local Embeddings: Vector Storage Setup for Supabase
-- Creates parallel table for all-MiniLM-L6-v2 embeddings (384 dimensions)

-- Create document_chunks_local table for local embeddings
CREATE TABLE IF NOT EXISTS document_chunks_local (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type TEXT NOT NULL CHECK (document_type IN ('smh', 'uhn')),
    document_name TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(384), -- all-MiniLM-L6-v2 produces 384-dimensional vectors
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique chunks per document
    UNIQUE(document_type, chunk_index)
);

-- Create index on embedding column for fast similarity search
-- Using HNSW (Hierarchical Navigable Small World) for better performance
CREATE INDEX IF NOT EXISTS document_chunks_local_embedding_idx 
ON document_chunks_local 
USING hnsw (embedding vector_cosine_ops);

-- Create index on document_type for filtered queries
CREATE INDEX IF NOT EXISTS document_chunks_local_document_type_idx 
ON document_chunks_local(document_type);

-- Create index on created_at for maintenance queries
CREATE INDEX IF NOT EXISTS document_chunks_local_created_at_idx 
ON document_chunks_local(created_at);

-- Add RLS (Row Level Security) policies
ALTER TABLE document_chunks_local ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to read chunks (for RAG retrieval)
CREATE POLICY "Allow anonymous read access" 
ON document_chunks_local 
FOR SELECT 
TO anon 
USING (true);

-- Allow authenticated users to insert chunks (for embedding script)
CREATE POLICY "Allow authenticated insert access" 
ON document_chunks_local 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow service role full access (for maintenance)
CREATE POLICY "Allow service role full access"
ON document_chunks_local
FOR ALL
TO service_role
USING (true);

-- Create function for similarity search with local embeddings
CREATE OR REPLACE FUNCTION match_document_chunks_local(
    query_embedding vector(384),
    doc_type TEXT,
    match_threshold FLOAT DEFAULT 0.5,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    document_type TEXT,
    document_name TEXT,
    chunk_index INTEGER,
    content TEXT,
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        document_chunks_local.id,
        document_chunks_local.document_type,
        document_chunks_local.document_name,
        document_chunks_local.chunk_index,
        document_chunks_local.content,
        document_chunks_local.metadata,
        1 - (document_chunks_local.embedding <=> query_embedding) AS similarity
    FROM document_chunks_local
    WHERE document_chunks_local.document_type = doc_type
        AND 1 - (document_chunks_local.embedding <=> query_embedding) > match_threshold
    ORDER BY document_chunks_local.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Add comments for documentation
COMMENT ON TABLE document_chunks_local IS 'Stores chunked document content with local all-MiniLM-L6-v2 embeddings (384-dim) for RAG retrieval';
COMMENT ON COLUMN document_chunks_local.embedding IS 'all-MiniLM-L6-v2 384-dimensional vector (local model)';
COMMENT ON COLUMN document_chunks_local.metadata IS 'JSON metadata: {page_number, section_title, char_start, char_end}';
COMMENT ON FUNCTION match_document_chunks_local IS 'Similarity search function for RAG retrieval using local embeddings';




