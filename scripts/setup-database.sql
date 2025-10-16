-- RAG Enhancement: Vector Storage Setup for Supabase
-- Enable pgvector extension for vector similarity search

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document_chunks table for RAG
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type TEXT NOT NULL CHECK (document_type IN ('smh', 'uhn')),
    document_name TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536), -- OpenAI text-embedding-3-small produces 1536-dimensional vectors
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique chunks per document
    UNIQUE(document_type, chunk_index)
);

-- Create index on embedding column for fast similarity search
-- Using HNSW (Hierarchical Navigable Small World) for better performance
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx 
ON document_chunks 
USING hnsw (embedding vector_cosine_ops);

-- Create index on document_type for filtered queries
CREATE INDEX IF NOT EXISTS document_chunks_document_type_idx 
ON document_chunks(document_type);

-- Create index on created_at for maintenance queries
CREATE INDEX IF NOT EXISTS document_chunks_created_at_idx 
ON document_chunks(created_at);

-- Add RLS (Row Level Security) policies
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to read chunks (for RAG retrieval)
CREATE POLICY "Allow anonymous read access" 
ON document_chunks 
FOR SELECT 
TO anon 
USING (true);

-- Allow authenticated users to insert chunks (for embedding script)
CREATE POLICY "Allow authenticated insert access" 
ON document_chunks 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow service role full access (for maintenance)
CREATE POLICY "Allow service role full access"
ON document_chunks
FOR ALL
TO service_role
USING (true);

-- Allow anonymous users to update ratings (for rating functionality)
CREATE POLICY "Allow anonymous update ratings"
ON chat_conversations
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Update chat_conversations table to support RAG logging
ALTER TABLE chat_conversations
ADD COLUMN IF NOT EXISTS retrieval_method TEXT DEFAULT 'full' CHECK (retrieval_method IN ('full', 'rag')),
ADD COLUMN IF NOT EXISTS chunks_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS retrieval_time_ms INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS user_rating TEXT DEFAULT NULL CHECK (user_rating IN ('thumbs_up', 'thumbs_down', NULL));

-- Create function for similarity search (helper for application)
CREATE OR REPLACE FUNCTION match_document_chunks(
    query_embedding vector(1536),
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
        document_chunks.id,
        document_chunks.document_type,
        document_chunks.document_name,
        document_chunks.chunk_index,
        document_chunks.content,
        document_chunks.metadata,
        1 - (document_chunks.embedding <=> query_embedding) AS similarity
    FROM document_chunks
    WHERE document_chunks.document_type = doc_type
        AND 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
    ORDER BY document_chunks.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Add comments for documentation
COMMENT ON TABLE document_chunks IS 'Stores chunked document content with vector embeddings for RAG retrieval';
COMMENT ON COLUMN document_chunks.embedding IS 'OpenAI text-embedding-3-small 1536-dimensional vector';
COMMENT ON COLUMN document_chunks.metadata IS 'JSON metadata: {page_number, section_title, char_start, char_end}';
COMMENT ON FUNCTION match_document_chunks IS 'Similarity search function for RAG retrieval';

