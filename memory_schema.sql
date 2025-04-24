-- Memory module Supabase schema

-- Enable Row Level Security (RLS)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Entities table to store the basic node information
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    entity_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index on name for faster lookups
CREATE INDEX IF NOT EXISTS entities_name_idx ON entities(name);
CREATE INDEX IF NOT EXISTS entities_entity_type_idx ON entities(entity_type);

-- Observations table to store observations attached to entities
CREATE TABLE IF NOT EXISTS observations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for faster lookup by entity_id
CREATE INDEX IF NOT EXISTS observations_entity_id_idx ON observations(entity_id);
-- Add index for content to improve text search
CREATE INDEX IF NOT EXISTS observations_content_idx ON observations USING GIN (to_tsvector('english', content));

-- Relations table to store connections between entities
CREATE TABLE IF NOT EXISTS relations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    to_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure no duplicate relations of the same type between the same entities
    UNIQUE(from_entity_id, to_entity_id, relation_type)
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS relations_from_entity_id_idx ON relations(from_entity_id);
CREATE INDEX IF NOT EXISTS relations_to_entity_id_idx ON relations(to_entity_id);
CREATE INDEX IF NOT EXISTS relations_relation_type_idx ON relations(relation_type);

-- Create triggers to automatically update the updated_at fields
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_entities_timestamp
BEFORE UPDATE ON entities
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_observations_timestamp
BEFORE UPDATE ON observations
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_relations_timestamp
BEFORE UPDATE ON relations
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Enable Row Level Security
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE relations ENABLE ROW LEVEL SECURITY;

-- Create policies that allow authenticated users to select data
CREATE POLICY select_entities ON entities FOR SELECT USING (true);
CREATE POLICY select_observations ON observations FOR SELECT USING (true);
CREATE POLICY select_relations ON relations FOR SELECT USING (true);

-- Create policies that allow authenticated users to insert data
CREATE POLICY insert_entities ON entities FOR INSERT WITH CHECK (true);
CREATE POLICY insert_observations ON observations FOR INSERT WITH CHECK (true);
CREATE POLICY insert_relations ON relations FOR INSERT WITH CHECK (true);

-- Create policies that allow authenticated users to update data
CREATE POLICY update_entities ON entities FOR UPDATE USING (true);
CREATE POLICY update_observations ON observations FOR UPDATE USING (true);
CREATE POLICY update_relations ON relations FOR UPDATE USING (true);

-- Create policies that allow authenticated users to delete data
CREATE POLICY delete_entities ON entities FOR DELETE USING (true);
CREATE POLICY delete_observations ON observations FOR DELETE USING (true);
CREATE POLICY delete_relations ON relations FOR DELETE USING (true);
